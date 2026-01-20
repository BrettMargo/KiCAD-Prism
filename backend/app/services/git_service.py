import os
from fastapi import APIRouter, HTTPException
from git import Repo
from typing import List, Dict, Any
from pydantic import BaseModel
import datetime

router = APIRouter()

# Configuration
# Default to sibling directory for development
DEFAULT_REPO_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../JTYU-OBC"))

class CommitInfo(BaseModel):
    hexsha: str
    message: str
    author: str
    date: str

class FileContentRequest(BaseModel):
    repo_path: str = DEFAULT_REPO_PATH
    commit_sha: str
    file_path: str

@router.get("/commits", response_model=List[CommitInfo])
async def list_commits(repo_path: str = DEFAULT_REPO_PATH, limit: int = 50):
    """
    List commits for a given repository.
    """
    if not os.path.exists(repo_path):
        raise HTTPException(status_code=404, detail=f"Repository not found at {repo_path}")
    
    try:
        repo = Repo(repo_path)
        commits = []
        for commit in repo.iter_commits(max_count=limit):
            commits.append(CommitInfo(
                hexsha=commit.hexsha,
                message=commit.message.strip(),
                author=commit.author.name,
                date=datetime.datetime.fromtimestamp(commit.committed_date).isoformat()
            ))
        return commits
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Git error: {str(e)}")

def get_releases(repo_path: str):
    """
    Get list of Git tags/releases from repository.
    """
    if not os.path.exists(repo_path):
        raise HTTPException(status_code=404, detail=f"Repository not found at {repo_path}")
    
    try:
        repo = Repo(repo_path)
        releases = []
        for tag in repo.tags:
            releases.append({
                "tag": tag.name,
                "commit_hash": tag.commit.hexsha[:7],
                "date": datetime.datetime.fromtimestamp(tag.commit.committed_date).isoformat(),
                "message": tag.commit.message.strip()
            })
        # Sort by date descending (newest first)
        releases.sort(key=lambda x: x['date'], reverse=True)
        return releases
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Git error: {str(e)}")

def get_commits_list(repo_path: str, limit: int = 50):
    """
    Get list of commits from repository.
    """
    if not os.path.exists(repo_path):
        raise HTTPException(status_code=404, detail=f"Repository not found at {repo_path}")
    
    try:
        repo = Repo(repo_path)
        commits = []
        for commit in repo.iter_commits(max_count=limit):
            commits.append({
                "hash": commit.hexsha[:7],
                "full_hash": commit.hexsha,
                "author": commit.author.name,
                "email": commit.author.email,
                "date": datetime.datetime.fromtimestamp(commit.committed_date).isoformat(),
                "message": commit.message.strip()
            })
        return commits
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Git error: {str(e)}")

@router.get("/content")
async def get_file_content(commit_sha: str, file_path: str, repo_path: str = DEFAULT_REPO_PATH):
    """
    Get file content from a specific commit.
    """
    if not os.path.exists(repo_path):
         raise HTTPException(status_code=404, detail=f"Repository not found at {repo_path}")

    try:
        repo = Repo(repo_path)
        commit = repo.commit(commit_sha)
        
        try:
            target_file = commit.tree / file_path
            # For text files, we decode. For binaries, we might need a different strategy (e.g. base64)
            # For now, let's assume text or try to decode utf-8
            blob = target_file.data_stream.read()
            return {"content": blob.decode('utf-8'), "size": target_file.size}
        except KeyError:
             raise HTTPException(status_code=404, detail=f"File {file_path} not found in commit {commit_sha}")
        except UnicodeDecodeError:
             return {"content": "Binary file (preview not available)", "size": target_file.size, "is_binary": True}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Git error: {str(e)}")

def get_file_from_commit(repo_path: str, commit_hash: str, file_path: str) -> str:
    """
    Get file content from a specific commit.
    Returns file content as string.
    """
    try:
        repo = Repo(repo_path)
        commit = repo.commit(commit_hash)
        
        try:
            blob = commit.tree / file_path
            content = blob.data_stream.read()
            return content.decode('utf-8')
        except KeyError:
            raise HTTPException(status_code=404, detail=f"File {file_path} not found in commit")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="Binary file cannot be decoded")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Git error: {str(e)}")

def file_exists_in_commit(repo_path: str, commit_hash: str, file_path: str) -> bool:
    """
    Check if a file exists in a specific commit.
    """
    try:
        repo = Repo(repo_path)
        commit = repo.commit(commit_hash)
        try:
            _ = commit.tree / file_path
            return True
        except KeyError:
            return False
    except:
        return False


def sync_with_remote(repo_path: str) -> Dict[str, Any]:
    """
    Sync local repository with remote by performing a hard reset.
    
    This fetches the latest changes from origin and performs a hard reset
    to match the remote branch state exactly.
    
    Returns:
        Dict with sync status information including:
        - success: bool
        - previous_commit: str
        - current_commit: str
        - commits_pulled: int
        - message: str
    """
    if not os.path.exists(repo_path):
        raise HTTPException(status_code=404, detail=f"Repository not found at {repo_path}")
    
    try:
        repo = Repo(repo_path)
        
        # Get current HEAD before sync
        previous_commit = repo.head.commit.hexsha
        
        # Determine the tracking branch
        try:
            tracking_branch = repo.active_branch.tracking_branch()
            if tracking_branch is None:
                # Default to origin/main or origin/master
                remote_refs = [ref.name for ref in repo.remotes.origin.refs]
                if 'origin/main' in remote_refs:
                    remote_branch = 'origin/main'
                elif 'origin/master' in remote_refs:
                    remote_branch = 'origin/master'
                else:
                    # Use the first remote branch
                    remote_branch = remote_refs[0] if remote_refs else 'origin/main'
            else:
                remote_branch = tracking_branch.name
        except Exception:
            remote_branch = 'origin/main'
        
        # Fetch latest changes from origin
        origin = repo.remotes.origin
        fetch_info = origin.fetch()
        
        # Count commits behind
        commits_behind = 0
        try:
            commits_behind = len(list(repo.iter_commits(f'HEAD..{remote_branch}')))
        except Exception:
            pass
        
        # Hard reset to remote branch
        repo.git.reset('--hard', remote_branch)
        
        # Get new HEAD after sync
        current_commit = repo.head.commit.hexsha
        
        return {
            "success": True,
            "previous_commit": previous_commit[:7],
            "current_commit": current_commit[:7],
            "commits_pulled": commits_behind,
            "message": f"Successfully synced to {remote_branch}. Pulled {commits_behind} commit(s)."
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")
