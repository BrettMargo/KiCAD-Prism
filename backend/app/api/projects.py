import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from typing import List, Optional
from app.services import project_service, file_service, path_config_service
from app.services.git_service import (get_releases, get_commits_list, get_file_from_commit, file_exists_in_commit, get_releases_filtered, get_commits_list_filtered, get_file_from_commit_with_prefix)
from app.services.path_config_service import PathConfig

router = APIRouter()

from pydantic import BaseModel
from typing import Dict, List, Optional

class Monorepo(BaseModel):
    name: str
    path: str
    project_count: int
    last_synced: Optional[str] = None
    repo_url: Optional[str] = None

@router.get("/", response_model=List[project_service.Project])
async def list_projects():
    """Return all registered projects (both Type-1 and Type-2)."""
    return project_service.get_registered_projects()

@router.get("/monorepos", response_model=List[Monorepo])
async def list_monorepos():
    """
    List all monorepos with their metadata.
    """
    monorepos = []
    
    if os.path.exists(project_service.MONOREPOS_ROOT):
        for repo_name in os.listdir(project_service.MONOREPOS_ROOT):
            repo_path = os.path.join(project_service.MONOREPOS_ROOT, repo_name)
            if not os.path.isdir(repo_path) or repo_name.startswith('.'):
                continue
            
            # Count projects in this monorepo
            all_projects = project_service.get_registered_projects()
            repo_projects = [p for p in all_projects if p.parent_repo == repo_name]
            
            # Get last synced time from git
            last_synced = None
            git_dir = os.path.join(repo_path, '.git')
            if os.path.exists(git_dir):
                try:
                    import subprocess
                    result = subprocess.run(
                        ['git', '-C', repo_path, 'log', '-1', '--format=%ci'],
                        capture_output=True, text=True
                    )
                    if result.returncode == 0:
                        last_synced = result.stdout.strip()
                except:
                    pass
            
            # Get repo URL from first project
            repo_url = None
            if repo_projects:
                repo_url = repo_projects[0].repo_url
            
            monorepos.append(Monorepo(
                name=repo_name,
                path=repo_path,
                project_count=len(repo_projects),
                last_synced=last_synced,
                repo_url=repo_url
            ))
    
    return monorepos

@router.get("/monorepos/{repo_name}/structure")
async def get_monorepo_structure(repo_name: str, subpath: str = ""):
    """
    Get folder structure for a monorepo at a given subpath.
    Returns folders and projects at that level.
    """
    repo_path = os.path.join(project_service.MONOREPOS_ROOT, repo_name)
    if not os.path.exists(repo_path) or not os.path.isdir(repo_path):
        raise HTTPException(status_code=404, detail="Monorepo not found")
    
    current_path = os.path.join(repo_path, subpath) if subpath else repo_path
    if not os.path.exists(current_path) or not os.path.isdir(current_path):
        raise HTTPException(status_code=404, detail="Path not found")
    
    # Security: ensure path is within repo
    if not os.path.abspath(current_path).startswith(os.path.abspath(repo_path)):
        raise HTTPException(status_code=400, detail="Invalid path")
    
    folders = []
    projects = []
    
    all_registered = project_service.get_registered_projects()
    repo_projects = {p.sub_path: p for p in all_registered if p.parent_repo == repo_name}
    
    for item in os.listdir(current_path):
        item_path = os.path.join(current_path, item)
        relative_path = os.path.relpath(item_path, repo_path)
        
        if os.path.isdir(item_path):
            # Skip hidden directories and archive folders
            if item.startswith('.') or item.lower() in ['archive', 'archived', 'old', 'backup', 'backups', 'obsolete']:
                continue
            
            # Count items in folder (for display)
            try:
                item_count = len(os.listdir(item_path))
            except:
                item_count = 0
            
            folders.append({
                "name": item,
                "path": relative_path,
                "item_count": item_count
            })
        
        # Check if this directory contains a .kicad_pro file
        if os.path.isdir(item_path):
            pro_files = [f for f in os.listdir(item_path) if f.endswith('.kicad_pro')]
            if pro_files:
                # This is a KiCAD project
                project = repo_projects.get(relative_path)
                if project:
                    # Get custom display name for this project
                    full_project_path = os.path.join(current_path, item)
                    custom_display_name = path_config_service.get_project_display_name(full_project_path)
                    
                    projects.append({
                        "id": project.id,
                        "name": project.name,
                        "display_name": custom_display_name,
                        "relative_path": relative_path,
                        "has_thumbnail": project_service.get_project_thumbnail_path(project.id) is not None,
                        "last_modified": project.last_modified
                    })
    
    return {
        "repo_name": repo_name,
        "current_path": subpath,
        "folders": folders,
        "projects": projects
    }

@router.get("/search")
async def search_projects(q: str = ""):
    """
    Search across all projects (standalone and monorepo sub-projects).
    Returns matching projects based on name and description.
    """
    if not q:
        return {"results": []}
    
    query = q.lower()
    all_projects = project_service.get_registered_projects()
    
    results = []
    for project in all_projects:
        if (query in project.name.lower() or 
            query in project.description.lower() or
            (project.parent_repo and query in project.parent_repo.lower())):
            results.append({
                "id": project.id,
                "name": project.name,
                "description": project.description,
                "parent_repo": project.parent_repo,
                "sub_path": project.sub_path,
                "last_modified": project.last_modified,
                "thumbnail_url": f"/api/projects/{project.id}/thumbnail"
            })
    
    return {"results": results}

from app.services import project_import_service

class AnalyzeRequest(BaseModel):
    url: str

class ImportRequest(BaseModel):
    url: str
    import_type: str  # "type1" or "type2"
    selected_paths: Optional[List[str]] = None

@router.post("/analyze")
async def analyze_repository(request: AnalyzeRequest):
    """
    Analyze a repository to determine import type and discover KiCAD projects.
    Returns Type-1 or Type-2 classification and project list.
    """
    try:
        job_id = project_import_service.start_analyze_job(request.url)
        return {"job_id": job_id, "status": "started"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@router.post("/import")
async def import_project(request: ImportRequest):
    """
    Start an async project import job.
    For Type-1: imports single project at root.
    For Type-2: imports selected subprojects.
    """
    try:
        job_id = project_import_service.start_import_job(
            repo_url=request.url,
            import_type=request.import_type,
            selected_paths=request.selected_paths
        )
        return {"job_id": job_id, "status": "started"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    """
    Get the status of an import job.
    """
    status = project_import_service.get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    return status

@router.post("/{project_id}/sync")
async def sync_project_endpoint(project_id: str):
    """
    Sync project repository with remote.
    Type-1: pulls the project repo.
    Type-2: pulls the parent repo.
    """
    result = project_import_service.sync_project(project_id)
    
    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])
    
    return result

class WorkflowRequest(BaseModel):
    type: str # design, manufacturing, render
    author: Optional[str] = "anonymous"

@router.post("/{project_id}/workflows")
async def trigger_workflow(project_id: str, request: WorkflowRequest):
    """
    Trigger a KiCAD workflow (jobset output).
    """
    valid_types = ["design", "manufacturing", "render"]
    if request.type not in valid_types:
        raise HTTPException(status_code=400, detail="Invalid workflow type")
        
    try:
        job_id = project_service.start_workflow_job(project_id, request.type, request.author)
        return {"job_id": job_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{project_id}/thumbnail")
async def get_project_thumbnail(project_id: str):
    path = project_service.get_project_thumbnail_path(project_id)
    if not path:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(path)

@router.get("/{project_id}", response_model=project_service.Project)
async def get_project_detail(project_id: str):
    """Get detailed project information."""
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.delete("/{project_id}")
async def delete_project_endpoint(project_id: str):
    """
    Delete a project from the registry.
    For standalone projects, this also deletes the project files.
    For monorepo sub-projects, only removes the registry entry.
    """
    success = project_service.delete_project(project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"message": "Project deleted successfully"}

@router.get("/{project_id}/files", response_model=List[file_service.FileItem])
async def get_project_files(project_id: str, type: str = "design"):
    """
    List files in Design-Outputs or Manufacturing-Outputs.
    
    Args:
        project_id: Project identifier
        type: 'design' or 'manufacturing'
    """
    if type not in ["design", "manufacturing"]:
        raise HTTPException(status_code=400, detail="Type must be 'design' or 'manufacturing'")
    
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return file_service.get_project_files(project.path, type)

@router.get("/{project_id}/download")
async def download_file(project_id: str, path: str, type: str = "design", inline: bool = False):
    """
    Download a specific file from Design-Outputs or Manufacturing-Outputs.
    
    Args:
        project_id: Project identifier
        path: Relative path to file within output folder
        type: 'design' or 'manufacturing'
        inline: If True, serve as inline content (view in browser)
    """
    if type not in ["design", "manufacturing"]:
        raise HTTPException(status_code=400, detail="Type must be 'design' or 'manufacturing'")
    
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get output directory from path config
    resolved = path_config_service.resolve_paths(project.path)
    if type == "design":
        output_dir = resolved.design_outputs_dir
    else:
        output_dir = resolved.manufacturing_outputs_dir
    
    if not output_dir:
        raise HTTPException(status_code=404, detail=f"{type} outputs folder not configured")
    
    file_path = os.path.join(output_dir, path)
    
    # Security: prevent directory traversal
    if not os.path.abspath(file_path).startswith(os.path.abspath(output_dir)):
        raise HTTPException(status_code=400, detail="Invalid file path")
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    if os.path.isdir(file_path):
        raise HTTPException(status_code=400, detail="Cannot download directory")
    
    disposition = "inline" if inline else "attachment"
    return FileResponse(file_path, filename=os.path.basename(file_path), content_disposition_type=disposition)

@router.get("/{project_id}/readme")
async def get_project_readme(project_id: str, commit: str = None):
    """
    Get README content from project root.
    If commit is provided, fetch from that commit; otherwise use working directory.
    For Type-2 projects, uses parent repo with relative path prefix.
    """
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get readme path from config
    config = path_config_service.get_path_config(project.path)
    readme_filename = config.readme or "README.md"
    
    # If viewing a specific commit, use Git
    if commit:
        try:
            # For Type-2 projects, use parent repo path with relative prefix
            if project.import_type == "type2_subproject":
                repo_path = project.parent_repo_path or os.path.dirname(project.path)
                content = get_file_from_commit_with_prefix(repo_path, commit, readme_filename, project.sub_path)
            else:
                content = get_file_from_commit(project.path, commit, readme_filename)
            return {"content": content}
        except HTTPException:
            raise
    
    # Otherwise read from filesystem
    resolved = path_config_service.resolve_paths(project.path)
    readme_path = resolved.readme_path
    
    if not readme_path or not os.path.exists(readme_path):
        raise HTTPException(status_code=404, detail="README not found")
    
    try:
        with open(readme_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading README: {str(e)}")

@router.get("/{project_id}/asset/{asset_path:path}")
async def get_project_asset(project_id: str, asset_path: str):
    """
    Serve assets (images, etc.) from project directory.
    Typically used for README image references.
    """
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Resolve asset path (typically relative to project root)
    file_path = os.path.join(project.path, asset_path)
    
    # Security: prevent directory traversal
    if not os.path.abspath(file_path).startswith(os.path.abspath(project.path)):
        raise HTTPException(status_code=400, detail="Invalid asset path")
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Asset not found")
    
    if os.path.isdir(file_path):
        raise HTTPException(status_code=400, detail="Cannot serve directory")
    
    return FileResponse(file_path)

@router.get("/{project_id}/docs")
async def get_docs_files(project_id: str):
    """
    List all files in the documentation folder.
    """
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    resolved = path_config_service.resolve_paths(project.path)
    docs_dir = resolved.documentation_dir
    
    if not docs_dir or not os.path.exists(docs_dir):
        return []  # Return empty list if docs not configured/found
    
    return file_service.get_files_recursive(docs_dir)

@router.get("/{project_id}/docs/content")
async def get_doc_file_content(project_id: str, path: str, commit: str = None):
    """
    Get markdown file content from documentation folder.
    If commit is provided, fetch from that commit; otherwise use working directory.
    For Type-2 projects, uses parent repo with relative path prefix.
    """
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get documentation path from config
    config = path_config_service.get_path_config(project.path)
    docs_path = config.documentation or "docs"
    
    # If viewing a specific commit, use Git
    if commit:
        try:
            file_path = f"{docs_path}/{path}"
            # For Type-2 projects, use parent repo path with relative prefix
            if project.import_type == "type2_subproject":
                repo_path = project.parent_repo_path or os.path.dirname(project.path)
                # Prepend relative_path to the docs path
                relative_prefix = f"{project.sub_path}/{docs_path}" if project.sub_path else docs_path
                content = get_file_from_commit_with_prefix(repo_path, commit, path, relative_prefix)
            else:
                content = get_file_from_commit(project.path, commit, file_path)
            return {"content": content, "path": path}
        except HTTPException:
            raise
    
    # Otherwise read from filesystem
    resolved = path_config_service.resolve_paths(project.path)
    docs_dir = resolved.documentation_dir
    
    if not docs_dir or not os.path.exists(docs_dir):
        raise HTTPException(status_code=404, detail="Documentation folder not found")
    
    file_path = os.path.join(docs_dir, path)
    
    # Security: prevent directory traversal
    if not os.path.abspath(file_path).startswith(os.path.abspath(docs_dir)):
        raise HTTPException(status_code=400, detail="Invalid file path")
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return {"content": content, "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")

@router.get("/{project_id}/releases")
async def get_project_releases(project_id: str):
    """
    Get list of Git releases/tags for a project.
    For Type-2 projects, uses parent repo with subproject file tracking.
    """
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # For Type-2 projects, use parent repo path and relative path (sub_path)
    if project.import_type == "type2_subproject":
        repo_path = project.parent_repo_path or os.path.dirname(project.path)
        relative_path = project.sub_path
        releases = get_releases_filtered(repo_path, relative_path)
    else:
        releases = get_releases(project.path)
    
    return {"releases": releases}

@router.get("/{project_id}/commits")
async def get_project_commits(project_id: str, limit: int = 50):
    """
    Get list of commits for a project.
    For Type-2 projects, shows only commits affecting the subproject.
    """
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # For Type-2 projects, use parent repo path and filter by relative path (sub_path)
    if project.import_type == "type2_subproject":
        repo_path = project.parent_repo_path or os.path.dirname(project.path)
        relative_path = project.sub_path
        commits = get_commits_list_filtered(repo_path, relative_path, limit)
    else:
        commits = get_commits_list(project.path, limit)
    
    return {"commits": commits}


@router.get("/{project_id}/schematic")
async def get_project_schematic(project_id: str):
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    path = project_service.find_schematic_file(project.path)
    if not path:
        raise HTTPException(status_code=404, detail="Schematic not found")
    return FileResponse(path)

@router.get("/{project_id}/schematic/subsheets")
async def get_project_subsheets(project_id: str):
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    main_path = project_service.find_schematic_file(project.path)
    if not main_path:
        raise HTTPException(status_code=404, detail="Schematic not found")
        
    subsheets = project_service.get_subsheets(project.path, main_path)
    # Convert filenames to URLs
    subsheet_urls = [{"name": s, "url": f"/api/projects/{project_id}/asset/{s}"} for s in subsheets]
    return {"files": subsheet_urls}

@router.get("/{project_id}/pcb")
async def get_project_pcb(project_id: str):
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    path = project_service.find_pcb_file(project.path)
    if not path:
        raise HTTPException(status_code=404, detail="PCB not found")
    return FileResponse(path)

@router.get("/{project_id}/3d-model")
async def get_project_3d_model(project_id: str):
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    path = project_service.find_3d_model(project.path)
    if not path:
        raise HTTPException(status_code=404, detail="3D model not found")
    return FileResponse(path)

@router.get("/{project_id}/ibom")
async def get_project_ibom(project_id: str):
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    path = project_service.find_ibom_file(project.path)
    if not path:
        raise HTTPException(status_code=404, detail="iBoM not found")
    return FileResponse(path)


# Path Configuration Endpoints

@router.get("/{project_id}/config")
async def get_project_config(project_id: str):
    """
    Get path configuration for a project.
    Returns the current path configuration (from .prism.json or auto-detected).
    """
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    config = path_config_service.get_path_config(project.path)
    resolved = path_config_service.resolve_paths(project.path, config)
    
    return {
        "config": config.dict(),
        "resolved": resolved.dict(),
        "source": "explicit" if path_config_service._load_prism_config(project.path) else "auto-detected"
    }


@router.post("/{project_id}/detect-paths")
async def detect_project_paths(project_id: str):
    """
    Run auto-detection on project paths.
    Returns detected paths without saving them.
    """
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    detected = path_config_service.detect_paths(project.path)
    
    return {
        "detected": detected.dict(),
        "validation": path_config_service.validate_config(project.path, detected)
    }


@router.put("/{project_id}/config")
async def update_project_config(project_id: str, config: PathConfig):
    """
    Update path configuration for a project.
    Saves configuration to .prism.json file.
    """
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Validate the config before saving
    validation = path_config_service.validate_config(project.path, config)
    
    # Save the configuration
    path_config_service.save_path_config(project.path, config)
    
    # Clear cache to ensure fresh resolution
    path_config_service.clear_config_cache(project.path)
    
    # Get resolved paths
    resolved = path_config_service.resolve_paths(project.path, config)
    
    return {
        "config": config.dict(),
        "resolved": resolved.dict(),
        "validation": validation
    }


class ProjectNameRequest(BaseModel):
    display_name: str


@router.get("/{project_id}/name")
async def get_project_name(project_id: str):
    """
    Get the display name for a project.
    Returns custom name from .prism.json or fallback name.
    """
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return {
        "display_name": project.display_name,
        "fallback_name": project.name
    }


@router.put("/{project_id}/name")
async def update_project_name(project_id: str, request: ProjectNameRequest):
    """
    Update the display name for a project in .prism.json.
    """
    project = project_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get current config
    config = path_config_service.get_path_config(project.path)
    
    # Update project name
    config.project_name = request.display_name.strip()
    
    # Save to .prism.json
    path_config_service.save_path_config(project.path, config)
    
    return {
        "display_name": request.display_name,
        "message": "Project name updated successfully"
    }
