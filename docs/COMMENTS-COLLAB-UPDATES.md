# Comments Collaboration Updates

This document summarizes recent improvements to KiCAD-Prism comment handling for both REST and local artifact workflows.

## Overview

The comments system now uses a database-first model for live collaboration, and generates `.comments/comments.json` as an export artifact when requested.

- Source of truth for comments/replies: SQLite
- Artifact for KiCad/local Git workflow: `.comments/comments.json`
- REST URL helpers are available per project and now include reply URL templates

## Backend Changes

### 1) Database-backed comment store

Implemented `CommentsStoreService` in:

- `backend/app/services/comments_store_service.py`

Key behavior:

- Stores comments and replies in SQLite with per-project isolation (`project_id`)
- Imports existing `.comments/comments.json` once per project (bootstrap)
- Supports CRUD operations for comments and replies
- Exports DB snapshot to `.comments/comments.json` atomically

### 2) Comments API refactor

Updated:

- `backend/app/api/comments.py`

Key behavior:

- `GET /api/projects/{project_id}/comments` reads DB snapshot
- `POST /api/projects/{project_id}/comments` creates comment in DB
- `PATCH /api/projects/{project_id}/comments/{comment_id}` updates status
- `POST /api/projects/{project_id}/comments/{comment_id}/replies` adds reply
- `DELETE /api/projects/{project_id}/comments/{comment_id}` deletes comment
- `POST /api/projects/{project_id}/comments/push` now only exports JSON artifact

Important: export endpoint no longer commits or pushes to Git. Users handle Git operations themselves.

### 3) URL helper service

Implemented:

- `backend/app/services/comments_url_service.py`

Updated:

- `backend/app/api/projects.py`

Key behavior:

- `GET /api/projects/{project_id}/comments/source-urls` returns:
  - `list_url`
  - `patch_url_template`
  - `reply_url_template`
  - `delete_url_template`
- Supports URL base resolution priority:
  1. `base_url` query param
  2. `COMMENTS_API_BASE_URL` env setting
  3. incoming request host/protocol (including forwarded headers)

### 4) Startup initialization

Updated:

- `backend/app/main.py`

The comments DB is initialized at backend startup.

### 5) Configuration

Updated:

- `backend/app/core/config.py`

Added/updated config:

- `COMMENTS_API_BASE_URL` (optional)
  - If set, helper URLs use this base (recommended for fixed LAN setups)
  - If empty, backend derives base URL from request host/IP

## Frontend Changes

### 1) Import dialog URL helpers

Updated:

- `frontend/src/components/import-dialog.tsx`

Now displays all four REST fields after import:

- List URL
- Patch URL Template
- Reply URL Template
- Delete URL Template

### 2) Visualizer REST helper UX

Updated:

- `frontend/src/components/visualizer.tsx`

Changes:

- Replaced fragile hover tooltip with persistent popover UI
- Added copy buttons for each URL field
- Included reply URL template display

### 3) Comment rendering and mode fixes

Updated:

- `frontend/src/components/visualizer.tsx`
- `frontend/src/components/comment-overlay.tsx`
- `frontend/src/components/comment-form.tsx`

Fixes:

- Correct SCH/PCB overlay filtering by active tab context
- Prevent comment context drift when switching tabs
- Keep comment-mode behavior consistent across tab changes
- Ensure add-comment dialog appears above overlays (z-index layering fix)

### 4) Export action naming

Updated:

- `frontend/src/components/visualizer.tsx`

`Push Comments` action is now labeled `Generate JSON` and triggers artifact export only.

## Operational Notes

### LAN hosting behavior

For users on other machines in the same network:

- Set `COMMENTS_API_BASE_URL` to a reachable host (example: `http://192.168.1.42:8000`), or
- Leave it empty and access backend via LAN IP so request-derived URL helpers are correct

### Git workflow

After pressing `Generate JSON`, use normal Git commands to stage/commit/push `.comments/comments.json` as needed.

## Validation

- Frontend build passes (`npm run build`)
- Backend touched modules compile (`py_compile`)
- Existing lint config issue remains unrelated (`eslint.config.js` recommended preset error)
