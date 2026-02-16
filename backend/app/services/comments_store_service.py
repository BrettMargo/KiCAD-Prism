"""
Comments storage service.

Design:
- SQLite is the single source of truth for comments/replies.
- Per-project isolation is enforced via project_id on every row.
- Existing .comments/comments.json is imported once per project on first access.
- comments.json is exported from DB when users press "Push Comments".
"""

from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import threading
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from app.services import project_service

COMMENTS_META = {
    "version": "1.0",
    "generator": "KiCad-Prism-Web",
}


def _utc_now_iso() -> str:
    """Return UTC timestamp in ISO-8601 format with Z suffix."""
    return datetime.utcnow().isoformat() + "Z"


def get_project_comments_json_path(project_path: str) -> str:
    """Return canonical comments.json path for a project."""
    return os.path.join(project_path, ".comments", "comments.json")


class CommentsStoreService:
    """SQLite-backed comments service."""

    def __init__(self) -> None:
        configured = os.environ.get("KICAD_COMMENTS_DB_PATH", "").strip()

        if configured:
            self._db_path = os.path.abspath(os.path.expanduser(configured))
        else:
            self._db_path = os.path.join(
                project_service.PROJECTS_ROOT,
                ".kicad-prism",
                "comments.sqlite3",
            )

        self._init_lock = threading.Lock()
        self._initialized = False

    def initialize(self) -> None:
        """Create DB schema if missing."""
        if self._initialized:
            return

        with self._init_lock:
            if self._initialized:
                return

            os.makedirs(os.path.dirname(self._db_path), exist_ok=True)

            with self._connect() as conn:
                conn.execute("PRAGMA journal_mode = WAL")
                conn.execute("PRAGMA busy_timeout = 5000")
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS comments (
                        id TEXT PRIMARY KEY,
                        project_id TEXT NOT NULL,
                        author TEXT NOT NULL,
                        timestamp TEXT NOT NULL,
                        status TEXT NOT NULL,
                        context TEXT NOT NULL,
                        location_x REAL NOT NULL,
                        location_y REAL NOT NULL,
                        location_layer TEXT NOT NULL DEFAULT '',
                        location_page TEXT NOT NULL DEFAULT '',
                        content TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS comment_replies (
                        id TEXT PRIMARY KEY,
                        comment_id TEXT NOT NULL,
                        project_id TEXT NOT NULL,
                        author TEXT NOT NULL,
                        timestamp TEXT NOT NULL,
                        content TEXT NOT NULL,
                        FOREIGN KEY(comment_id) REFERENCES comments(id) ON DELETE CASCADE
                    );

                    CREATE TABLE IF NOT EXISTS project_comment_state (
                        project_id TEXT PRIMARY KEY,
                        imported_from_json INTEGER NOT NULL DEFAULT 0,
                        imported_at TEXT,
                        last_exported_at TEXT,
                        last_export_commit TEXT
                    );

                    CREATE INDEX IF NOT EXISTS idx_comments_project
                        ON comments(project_id, timestamp, id);
                    CREATE INDEX IF NOT EXISTS idx_replies_project_comment
                        ON comment_replies(project_id, comment_id, timestamp, id);
                    """
                )

            self._initialized = True

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 5000")
        return conn

    def _bootstrap_project_if_needed(self, conn: sqlite3.Connection, project_id: str, project_path: str) -> None:
        conn.execute(
            """
            INSERT OR IGNORE INTO project_comment_state(project_id, imported_from_json)
            VALUES(?, 0)
            """,
            (project_id,),
        )

        state_row = conn.execute(
            "SELECT imported_from_json FROM project_comment_state WHERE project_id = ?",
            (project_id,),
        ).fetchone()

        imported = bool(state_row["imported_from_json"]) if state_row else False
        if imported:
            return

        existing_count = conn.execute(
            "SELECT COUNT(1) AS count FROM comments WHERE project_id = ?",
            (project_id,),
        ).fetchone()["count"]

        if existing_count == 0:
            payload = self._read_comments_json(project_path)
            if payload:
                self._import_comments_payload(conn, project_id, payload)

        conn.execute(
            """
            UPDATE project_comment_state
            SET imported_from_json = 1,
                imported_at = ?
            WHERE project_id = ?
            """,
            (_utc_now_iso(), project_id),
        )

    def _read_comments_json(self, project_path: str) -> Optional[Dict]:
        comments_path = get_project_comments_json_path(project_path)
        if not os.path.exists(comments_path):
            return None

        try:
            with open(comments_path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, json.JSONDecodeError):
            return None

        if not isinstance(payload, dict):
            return None

        comments = payload.get("comments")
        if not isinstance(comments, list):
            return None

        return payload

    def _import_comments_payload(self, conn: sqlite3.Connection, project_id: str, payload: Dict) -> None:
        comments = payload.get("comments", [])

        for raw_comment in comments:
            if not isinstance(raw_comment, dict):
                continue

            context = str(raw_comment.get("context", "PCB")).upper()
            if context not in {"PCB", "SCH"}:
                context = "PCB"

            status = str(raw_comment.get("status", "OPEN")).upper()
            if status not in {"OPEN", "RESOLVED"}:
                status = "OPEN"

            location = raw_comment.get("location", {})
            if not isinstance(location, dict):
                location = {}

            comment_id = str(raw_comment.get("id") or f"c_{uuid.uuid4().hex[:8]}")
            author = str(raw_comment.get("author") or "anonymous")
            timestamp = str(raw_comment.get("timestamp") or _utc_now_iso())
            content = str(raw_comment.get("content") or "")

            try:
                loc_x = float(location.get("x", 0.0))
                loc_y = float(location.get("y", 0.0))
            except (TypeError, ValueError):
                loc_x = 0.0
                loc_y = 0.0

            loc_layer = str(location.get("layer") or "")
            loc_page = str(location.get("page") or "")

            conn.execute(
                """
                INSERT OR IGNORE INTO comments(
                    id, project_id, author, timestamp, status, context,
                    location_x, location_y, location_layer, location_page, content
                )
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    comment_id,
                    project_id,
                    author,
                    timestamp,
                    status,
                    context,
                    loc_x,
                    loc_y,
                    loc_layer,
                    loc_page,
                    content,
                ),
            )

            replies = raw_comment.get("replies", [])
            if not isinstance(replies, list):
                continue

            for raw_reply in replies:
                if not isinstance(raw_reply, dict):
                    continue

                reply_id = str(raw_reply.get("id") or f"r_{uuid.uuid4().hex[:8]}")
                reply_author = str(raw_reply.get("author") or "anonymous")
                reply_timestamp = str(raw_reply.get("timestamp") or _utc_now_iso())
                reply_content = str(raw_reply.get("content") or "")

                conn.execute(
                    """
                    INSERT OR IGNORE INTO comment_replies(
                        id, comment_id, project_id, author, timestamp, content
                    )
                    VALUES(?, ?, ?, ?, ?, ?)
                    """,
                    (
                        reply_id,
                        comment_id,
                        project_id,
                        reply_author,
                        reply_timestamp,
                        reply_content,
                    ),
                )

    def _build_snapshot(self, conn: sqlite3.Connection, project_id: str) -> Dict:
        comment_rows = conn.execute(
            """
            SELECT id, author, timestamp, status, context,
                   location_x, location_y, location_layer, location_page, content
            FROM comments
            WHERE project_id = ?
            ORDER BY timestamp ASC, id ASC
            """,
            (project_id,),
        ).fetchall()

        reply_rows = conn.execute(
            """
            SELECT id, comment_id, author, timestamp, content
            FROM comment_replies
            WHERE project_id = ?
            ORDER BY timestamp ASC, id ASC
            """,
            (project_id,),
        ).fetchall()

        replies_by_comment: Dict[str, List[Dict]] = {}

        for row in reply_rows:
            replies_by_comment.setdefault(row["comment_id"], []).append(
                {
                    "author": row["author"],
                    "timestamp": row["timestamp"],
                    "content": row["content"],
                }
            )

        comments: List[Dict] = []
        for row in comment_rows:
            comments.append(
                {
                    "id": row["id"],
                    "author": row["author"],
                    "timestamp": row["timestamp"],
                    "status": row["status"],
                    "context": row["context"],
                    "location": {
                        "x": row["location_x"],
                        "y": row["location_y"],
                        "layer": row["location_layer"],
                        "page": row["location_page"],
                    },
                    "content": row["content"],
                    "replies": replies_by_comment.get(row["id"], []),
                }
            )

        return {
            "meta": dict(COMMENTS_META),
            "comments": comments,
        }

    def _get_comment_with_replies(self, conn: sqlite3.Connection, project_id: str, comment_id: str) -> Optional[Dict]:
        row = conn.execute(
            """
            SELECT id, author, timestamp, status, context,
                   location_x, location_y, location_layer, location_page, content
            FROM comments
            WHERE project_id = ? AND id = ?
            """,
            (project_id, comment_id),
        ).fetchone()

        if not row:
            return None

        reply_rows = conn.execute(
            """
            SELECT author, timestamp, content
            FROM comment_replies
            WHERE project_id = ? AND comment_id = ?
            ORDER BY timestamp ASC, id ASC
            """,
            (project_id, comment_id),
        ).fetchall()

        return {
            "id": row["id"],
            "author": row["author"],
            "timestamp": row["timestamp"],
            "status": row["status"],
            "context": row["context"],
            "location": {
                "x": row["location_x"],
                "y": row["location_y"],
                "layer": row["location_layer"],
                "page": row["location_page"],
            },
            "content": row["content"],
            "replies": [
                {
                    "author": reply["author"],
                    "timestamp": reply["timestamp"],
                    "content": reply["content"],
                }
                for reply in reply_rows
            ],
        }

    def get_comments_file(self, project_id: str, project_path: str) -> Dict:
        self.initialize()
        with self._connect() as conn:
            with conn:
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                return self._build_snapshot(conn, project_id)

    def create_comment(
        self,
        project_id: str,
        project_path: str,
        context: str,
        location: Dict,
        content: str,
        author: str,
    ) -> Dict:
        self.initialize()
        context_norm = context.upper()
        timestamp = _utc_now_iso()

        with self._connect() as conn:
            with conn:
                self._bootstrap_project_if_needed(conn, project_id, project_path)

                comment_id = f"c_{uuid.uuid4().hex[:8]}"
                conn.execute(
                    """
                    INSERT INTO comments(
                        id, project_id, author, timestamp, status, context,
                        location_x, location_y, location_layer, location_page, content
                    )
                    VALUES(?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        comment_id,
                        project_id,
                        author,
                        timestamp,
                        context_norm,
                        float(location.get("x", 0.0)),
                        float(location.get("y", 0.0)),
                        str(location.get("layer", "")),
                        str(location.get("page", "")),
                        content,
                    ),
                )

                created = self._get_comment_with_replies(conn, project_id, comment_id)
                if not created:
                    raise RuntimeError("Failed to fetch created comment.")

                return created

    def update_comment_status(
        self,
        project_id: str,
        project_path: str,
        comment_id: str,
        status: str,
    ) -> Optional[Dict]:
        self.initialize()

        with self._connect() as conn:
            with conn:
                self._bootstrap_project_if_needed(conn, project_id, project_path)

                cur = conn.execute(
                    """
                    UPDATE comments
                    SET status = ?
                    WHERE project_id = ? AND id = ?
                    """,
                    (status, project_id, comment_id),
                )

                if cur.rowcount == 0:
                    return None

                return self._get_comment_with_replies(conn, project_id, comment_id)

    def add_reply(
        self,
        project_id: str,
        project_path: str,
        comment_id: str,
        content: str,
        author: str,
    ) -> Optional[Tuple[Dict, Dict]]:
        self.initialize()
        timestamp = _utc_now_iso()
        reply_id = f"r_{uuid.uuid4().hex[:8]}"

        with self._connect() as conn:
            with conn:
                self._bootstrap_project_if_needed(conn, project_id, project_path)

                exists = conn.execute(
                    "SELECT 1 FROM comments WHERE project_id = ? AND id = ?",
                    (project_id, comment_id),
                ).fetchone()

                if not exists:
                    return None

                conn.execute(
                    """
                    INSERT INTO comment_replies(id, comment_id, project_id, author, timestamp, content)
                    VALUES(?, ?, ?, ?, ?, ?)
                    """,
                    (reply_id, comment_id, project_id, author, timestamp, content),
                )

                updated_comment = self._get_comment_with_replies(conn, project_id, comment_id)
                if not updated_comment:
                    return None

                return (
                    updated_comment,
                    {
                        "author": author,
                        "timestamp": timestamp,
                        "content": content,
                    },
                )

    def delete_comment(self, project_id: str, project_path: str, comment_id: str) -> bool:
        self.initialize()

        with self._connect() as conn:
            with conn:
                self._bootstrap_project_if_needed(conn, project_id, project_path)

                cur = conn.execute(
                    "DELETE FROM comments WHERE project_id = ? AND id = ?",
                    (project_id, comment_id),
                )
                return cur.rowcount > 0

    def export_comments_json(self, project_id: str, project_path: str) -> str:
        self.initialize()

        with self._connect() as conn:
            with conn:
                self._bootstrap_project_if_needed(conn, project_id, project_path)
                snapshot = self._build_snapshot(conn, project_id)

                comments_path = get_project_comments_json_path(project_path)
                os.makedirs(os.path.dirname(comments_path), exist_ok=True)

                fd, tmp_path = tempfile.mkstemp(
                    prefix=".comments-",
                    suffix=".tmp",
                    dir=os.path.dirname(comments_path),
                )

                try:
                    with os.fdopen(fd, "w", encoding="utf-8") as handle:
                        json.dump(snapshot, handle, indent=2)
                        handle.write("\n")
                    os.replace(tmp_path, comments_path)
                finally:
                    if os.path.exists(tmp_path):
                        os.unlink(tmp_path)

                conn.execute(
                    """
                    UPDATE project_comment_state
                    SET last_exported_at = ?
                    WHERE project_id = ?
                    """,
                    (_utc_now_iso(), project_id),
                )

                return comments_path

    def mark_export_commit(self, project_id: str, commit_sha: str) -> None:
        if not commit_sha:
            return

        self.initialize()
        with self._connect() as conn:
            with conn:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO project_comment_state(project_id, imported_from_json)
                    VALUES(?, 1)
                    """,
                    (project_id,),
                )
                conn.execute(
                    """
                    UPDATE project_comment_state
                    SET last_exported_at = ?,
                        last_export_commit = ?
                    WHERE project_id = ?
                    """,
                    (_utc_now_iso(), commit_sha, project_id),
                )


comments_store = CommentsStoreService()


def initialize_comments_store() -> None:
    comments_store.initialize()
