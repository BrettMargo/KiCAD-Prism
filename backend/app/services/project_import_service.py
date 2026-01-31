"""
Project Import Service for KiCAD Prism

Handles Type-1 (single project) and Type-2 (multiple projects) imports.
"""
import os
import shutil
import tempfile
import uuid
import threading
from pathlib import Path
from typing import List, Optional, Dict
from dataclasses import dataclass
from git import Repo, RemoteProgress
from app.services import project_service, path_config_service


@dataclass
class DiscoveredProject:
    """A KiCAD project discovered within a repository."""
    name: str
    relative_path: str
    full_path: str
    has_schematic: bool
    has_pcb: bool


@dataclass
class AnalysisResult:
    """Result of analyzing a repository for import."""
    repo_name: str
    repo_url: str
    import_type: str  # "type1" or "type2"
    projects: List[DiscoveredProject]
    temp_path: Optional[str] = None  # For cleanup after analysis


# Global job store for import operations
jobs: Dict[str, dict] = {}


class CloneProgress(RemoteProgress):
    """Git progress callback for clone operations."""
    
    def __init__(self, job_id: str):
        super().__init__()
        self.job_id = job_id
    
    def update(self, op_code, cur_count, max_count=None, message=''):
        if self.job_id in jobs:
            job = jobs[self.job_id]
            percent = 0
            if max_count and max_count > 0:
                percent = min((cur_count / max_count) * 100, 99)
            job['percent'] = int(percent)
            job['message'] = message or f"Cloning... {int(percent)}%"
            if message:
                job['logs'].append(f"[GIT] {message}")


def is_excluded_directory(dir_name: str) -> bool:
    """Check if directory should be excluded from project discovery."""
    excluded = {
        'archive', 'archived', 'old', 'backup', 'backups',
        'obsolete', 'deprecated', 'trash', '.git', '__pycache__',
        'node_modules', '.venv', 'venv', '.env'
    }
    return dir_name.lower() in excluded or dir_name.startswith('.')


def discover_kicad_projects(repo_path: str) -> List[DiscoveredProject]:
    """
    Discover all KiCAD projects within a repository.
    Excludes archive directories at any level.
    """
    projects = []
    repo_path = Path(repo_path)
    
    # Find all .kicad_pro files recursively
    for pro_file in repo_path.rglob("*.kicad_pro"):
        project_dir = pro_file.parent
        relative_path = project_dir.relative_to(repo_path).as_posix()
        
        # Skip if any parent directory is excluded
        should_exclude = False
        for parent in project_dir.relative_to(repo_path).parents:
            if is_excluded_directory(parent.name):
                should_exclude = True
                break
        
        if should_exclude:
            continue
        
        # Check for schematic and PCB files
        sch_files = list(project_dir.glob("*.kicad_sch"))
        pcb_files = list(project_dir.glob("*.kicad_pcb"))
        
        projects.append(DiscoveredProject(
            name=pro_file.stem,
            relative_path=relative_path if relative_path != "." else ".",
            full_path=str(project_dir),
            has_schematic=len(sch_files) > 0,
            has_pcb=len(pcb_files) > 0
        ))
    
    # Sort by path depth (shallow first) then by name
    projects.sort(key=lambda p: (len(p.relative_path.split('/')), p.name.lower()))
    
    return projects


def analyze_repository(repo_url: str) -> AnalysisResult:
    """
    Analyze a repository to determine import type and discover projects.
    Performs a shallow clone to a temporary directory.
    """
    repo_name = repo_url.rstrip('/').split('/')[-1].replace('.git', '')
    
    # Create temp directory for analysis
    temp_dir = tempfile.mkdtemp(prefix="kicad_analyze_")
    clone_path = Path(temp_dir) / repo_name
    
    try:
        # Shallow clone for analysis
        env = os.environ.copy()
        env['GIT_TERMINAL_PROMPT'] = '0'
        
        Repo.clone_from(
            repo_url,
            str(clone_path),
            depth=1,
            single_branch=True,
            env=env
        )
        
        # Discover projects
        projects = discover_kicad_projects(str(clone_path))
        
        # Determine import type
        # Type-1: Single .kicad_pro at root (relative_path == ".")
        # Type-2: Multiple projects or project not at root
        import_type = "type2"
        if len(projects) == 1 and projects[0].relative_path == ".":
            import_type = "type1"
        
        return AnalysisResult(
            repo_name=repo_name,
            repo_url=repo_url,
            import_type=import_type,
            projects=projects,
            temp_path=temp_dir
        )
        
    except Exception:
        # Cleanup on error
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise


def cleanup_analysis_temp(analysis: AnalysisResult):
    """Clean up temporary directory used for analysis."""
    if analysis.temp_path and os.path.exists(analysis.temp_path):
        shutil.rmtree(analysis.temp_path, ignore_errors=True)


def generate_project_id(base_id: str, registry: dict) -> str:
    """Generate unique project ID, handling collisions."""
    if base_id not in registry:
        return base_id
    
    # Check if same path (re-import)
    # For now, just add numeric suffix
    suffix = 1
    while f"{base_id}-{suffix}" in registry:
        suffix += 1
    return f"{base_id}-{suffix}"


def _run_import_job(job_id: str, repo_url: str, import_type: str, 
                    selected_paths: Optional[List[str]] = None):
    """
    Background job: Clone repository and register projects.
    """
    job = jobs[job_id]
    
    # Extract repo name
    repo_name = repo_url.rstrip('/').split('/')[-1].replace('.git', '')
    
    # Determine target directory based on type
    if import_type == "type1":
        base_path = Path(project_service.PROJECTS_ROOT) / "type1"
    else:
        base_path = Path(project_service.PROJECTS_ROOT) / "type2"
    
    target_path = base_path / repo_name
    
    try:
        # Check if already exists
        if target_path.exists():
            # Check if this is a "stranded" repo (directory exists but no registry entries)
            registry = project_service._load_project_registry()
            
            if import_type == "type2":
                # Check if any subprojects exist for this parent repo
                existing_subprojects = [
                    p for p in registry.values()
                    if p.get("parent_repo") == repo_name and p.get("import_type") == "type2_subproject"
                ]
                
                if existing_subprojects:
                    job['status'] = 'failed'
                    job['error'] = f"Repository '{repo_name}' already exists with registered projects"
                    job['logs'].append(f"Error: {target_path} already exists with {len(existing_subprojects)} registered subprojects")
                    return
                else:
                    # Stranded repo - delete it and allow re-import
                    job['logs'].append(f"Removing stranded repo: {target_path}")
                    try:
                        shutil.rmtree(target_path)
                    except Exception as e:
                        job['status'] = 'failed'
                        job['error'] = f"Failed to remove stranded repo: {e}"
                        return
            else:
                # Type-1: Check if project exists in registry
                existing_project = next(
                    (p for p in registry.values() 
                     if p.get("import_type") == "type1" and p.get("path") == str(target_path)),
                    None
                )
                if existing_project:
                    job['status'] = 'failed'
                    job['error'] = f"Repository '{repo_name}' already exists"
                    job['logs'].append(f"Error: {target_path} already exists")
                    return
                else:
                    # Stranded repo - delete it
                    job['logs'].append(f"Removing stranded repo: {target_path}")
                    try:
                        shutil.rmtree(target_path)
                    except Exception as e:
                        job['status'] = 'failed'
                        job['error'] = f"Failed to remove stranded repo: {e}"
                        return
        
        # Ensure base directory exists
        base_path.mkdir(parents=True, exist_ok=True)
        
        # Clone repository
        job['logs'].append(f"Cloning {repo_url}...")
        env = os.environ.copy()
        env['GIT_TERMINAL_PROMPT'] = '0'
        
        Repo.clone_from(
            repo_url,
            str(target_path),
            progress=CloneProgress(job_id),
            env=env
        )
        
        job['logs'].append("Clone complete. Registering projects...")
        
        # Load registry for ID generation
        registry = project_service._load_project_registry()
        imported_ids = []
        
        if import_type == "type1":
            # Single project at root
            project_id = generate_project_id(repo_name, registry)
            
            project_service.register_project(
                project_id=project_id,
                name=repo_name,
                path=str(target_path),
                repo_url=repo_url,
                sub_path=None,
                parent_repo=None,
                description=f"Project {repo_name}"
            )
            
            # Update registry entry with import metadata
            registry = project_service._load_project_registry()
            if project_id in registry:
                registry[project_id]['import_type'] = 'type1'
                project_service._save_project_registry(registry)
            
            imported_ids.append(project_id)
            job['logs'].append(f"Registered Type-1 project: {project_id}")
            
        else:
            # Type-2: Register selected subprojects
            if not selected_paths:
                job['status'] = 'failed'
                job['error'] = "No projects selected for Type-2 import"
                return
            
            for rel_path in selected_paths:
                # Generate ID from repo name and relative path
                safe_name = rel_path.replace('/', '-').replace(' ', '_')
                base_id = f"{repo_name}-{safe_name}"
                project_id = generate_project_id(base_id, registry)
                
                full_project_path = target_path / rel_path
                
                # Get project name from .kicad_pro file
                pro_files = list(full_project_path.glob("*.kicad_pro"))
                board_name = pro_files[0].stem if pro_files else os.path.basename(rel_path)
                
                project_service.register_project(
                    project_id=project_id,
                    name=board_name,
                    path=str(full_project_path),
                    repo_url=repo_url,
                    sub_path=rel_path,
                    parent_repo=repo_name,
                    description=f"{repo_name} / {board_name}"
                )
                
                # Update registry with import metadata
                registry = project_service._load_project_registry()
                if project_id in registry:
                    registry[project_id]['import_type'] = 'type2_subproject'
                    registry[project_id]['parent_repo_path'] = str(target_path)
                    registry[project_id]['relative_path'] = rel_path
                    project_service._save_project_registry(registry)
                
                imported_ids.append(project_id)
                job['logs'].append(f"Registered Type-2 subproject: {project_id}")
                
                # Refresh registry for next iteration
                registry = project_service._load_project_registry()
        
        job['project_ids'] = imported_ids
        job['status'] = 'completed'
        job['percent'] = 100
        job['message'] = f"Imported {len(imported_ids)} project(s)"
        job['logs'].append("Import completed successfully.")
        
    except Exception as e:
        job['status'] = 'failed'
        job['error'] = str(e)
        job['logs'].append(f"Error: {str(e)}")
        
        # Cleanup on failure
        if target_path.exists():
            try:
                shutil.rmtree(target_path)
            except:
                pass


def start_import_job(repo_url: str, import_type: str, 
                     selected_paths: Optional[List[str]] = None) -> str:
    """
    Start an asynchronous import job.
    Returns job ID for polling.
    """
    job_id = str(uuid.uuid4())
    
    jobs[job_id] = {
        "job_id": job_id,
        "status": "running",
        "message": "Starting import...",
        "percent": 0,
        "project_ids": [],
        "error": None,
        "logs": [f"Starting import of {repo_url}"],
        "type": "import",
        "repo_url": repo_url,
        "import_type": import_type
    }
    
    thread = threading.Thread(
        target=_run_import_job,
        args=(job_id, repo_url, import_type, selected_paths)
    )
    thread.daemon = True
    thread.start()
    
    return job_id


def get_job_status(job_id: str) -> Optional[dict]:
    """Get the current status of an import job."""
    return jobs.get(job_id)


def sync_project(project_id: str) -> dict:
    """
    Sync a project with its remote repository.
    For Type-1: pulls the project repo.
    For Type-2: pulls the parent repo.
    """
    registry = project_service._load_project_registry()
    
    if project_id not in registry:
        return {"status": "error", "message": "Project not found"}
    
    project_data = registry[project_id]
    import_type = project_data.get('import_type', 'type1')
    
    # Determine sync path
    if import_type == 'type2_subproject':
        # For Type-2, use parent_repo_path if available, otherwise derive from path
        sync_path = project_data.get('parent_repo_path')
        if not sync_path:
            # Fallback: go up from subproject path to parent repo
            sync_path = str(Path(project_data.get('path')).parent)
    else:
        sync_path = project_data.get('path')
    
    if not sync_path or not os.path.exists(sync_path):
        return {"status": "error", "message": f"Project path not found: {sync_path}"}
    
    try:
        repo = Repo(sync_path)
        origin = repo.remote('origin')
        
        # Fetch and pull
        env = os.environ.copy()
        env['GIT_TERMINAL_PROMPT'] = '0'
        
        fetch_info = origin.fetch(env=env)
        origin.pull()
        
        return {
            "status": "success",
            "message": f"Synced {len(fetch_info)} ref(s)",
            "path": sync_path
        }
        
    except Exception as e:
        return {"status": "error", "message": str(e)}
