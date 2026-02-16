"""
Comments API for KiCAD-Prism Collaboration Feature.

All comment CRUD is backed by SQLite (single source of truth).
comments.json is generated from DB only during push/export workflows.
"""

import os
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import project_service
from app.services.comments_store_service import comments_store

router = APIRouter()


# ============================================================
# PYDANTIC MODELS
# ============================================================

class CommentLocation(BaseModel):
    x: float
    y: float
    layer: str = ""
    page: str = ""


class CreateCommentRequest(BaseModel):
    context: str  # "PCB" or "SCH"
    location: CommentLocation
    content: str
    author: Optional[str] = "anonymous"


class CreateReplyRequest(BaseModel):
    content: str
    author: Optional[str] = "anonymous"


class UpdateCommentRequest(BaseModel):
    status: Optional[str] = None  # "OPEN" or "RESOLVED"


class CommentReply(BaseModel):
    author: str
    timestamp: str
    content: str


class Comment(BaseModel):
    id: str
    author: str
    timestamp: str
    status: str
    context: str
    location: CommentLocation
    content: str
    replies: List[CommentReply] = []


class CommentsMeta(BaseModel):
    version: str = "1.0"
    generator: str = "KiCad-Prism-Web"


class CommentsFile(BaseModel):
    meta: CommentsMeta = CommentsMeta()
    comments: List[Comment] = []


# ============================================================
# HELPERS
# ============================================================


def _get_project_or_404(project_id: str):
    project = project_service.get_project_by_id(project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return project


def _normalize_author(author: Optional[str]) -> str:
    return (author or "anonymous").strip() or "anonymous"


# ============================================================
# API ENDPOINTS
# ============================================================

@router.get("/{project_id}/comments")
async def get_comments(project_id: str):
    """
    Get all comments for a project from DB snapshot.
    """
    project = _get_project_or_404(project_id)
    return comments_store.get_comments_file(project.id, project.path)


@router.post("/{project_id}/comments")
async def create_comment(project_id: str, request: CreateCommentRequest):
    """
    Create a new comment on the design.
    """
    project = _get_project_or_404(project_id)

    context = request.context.upper()
    if context not in {"PCB", "SCH"}:
        raise HTTPException(status_code=400, detail="Context must be 'PCB' or 'SCH'")

    return comments_store.create_comment(
        project_id=project.id,
        project_path=project.path,
        context=context,
        location=request.location.model_dump(),
        content=request.content,
        author=_normalize_author(request.author),
    )


@router.patch("/{project_id}/comments/{comment_id}")
async def update_comment(project_id: str, comment_id: str, request: UpdateCommentRequest):
    """
    Update a comment's status (e.g., resolve it).
    """
    project = _get_project_or_404(project_id)

    if request.status is None:
        raise HTTPException(status_code=400, detail="No update fields provided")

    status = request.status.upper()
    if status not in {"OPEN", "RESOLVED"}:
        raise HTTPException(status_code=400, detail="Status must be 'OPEN' or 'RESOLVED'")

    updated_comment = comments_store.update_comment_status(
        project_id=project.id,
        project_path=project.path,
        comment_id=comment_id,
        status=status,
    )

    if not updated_comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    return updated_comment


@router.post("/{project_id}/comments/{comment_id}/replies")
async def add_reply(project_id: str, comment_id: str, request: CreateReplyRequest):
    """
    Add a reply to an existing comment.
    """
    project = _get_project_or_404(project_id)

    result = comments_store.add_reply(
        project_id=project.id,
        project_path=project.path,
        comment_id=comment_id,
        content=request.content,
        author=_normalize_author(request.author),
    )

    if not result:
        raise HTTPException(status_code=404, detail="Comment not found")

    comment, reply = result
    return {"comment": comment, "reply": reply}


@router.delete("/{project_id}/comments/{comment_id}")
async def delete_comment(project_id: str, comment_id: str):
    """
    Delete a comment.
    """
    project = _get_project_or_404(project_id)

    deleted = comments_store.delete_comment(
        project_id=project.id,
        project_path=project.path,
        comment_id=comment_id,
    )

    if not deleted:
        raise HTTPException(status_code=404, detail="Comment not found")

    return {"deleted": comment_id}


# ============================================================
# EXPORT ENDPOINT
# ============================================================

@router.post("/{project_id}/comments/push")
async def push_comments(project_id: str):
    """
    Export DB snapshot to comments.json artifact only.
    Git commit/push is intentionally left to the user workflow.
    """
    project = _get_project_or_404(project_id)

    try:
        comments_path = comments_store.export_comments_json(project.id, project.path)
        comments_rel_path = os.path.relpath(comments_path, project.path)

        return {
            "success": True,
            "message": "Generated comments artifact from DB snapshot.",
            "comments_path": comments_rel_path,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
