import os
import datetime
import shutil
from git import Repo, RemoteProgress
from typing import List, Optional
from pydantic import BaseModel
from fastapi.responses import FileResponse

class Project(BaseModel):
    id: str
    name: str
    description: str
    path: str
    last_modified: str
    thumbnail_url: Optional[str] = None

# Hardcoded for now, as per plan
# Projects stored in 'project-database' sibling to 'KiCAD-Prism'
PROJECTS_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../project-database"))

if not os.path.exists(PROJECTS_ROOT):
    os.makedirs(PROJECTS_ROOT)

def get_registered_projects() -> List[Project]:
    """
    Dynamically scan the PROJECTS_ROOT for project folders.
    A valid project folder is considered any directory in the root.
    """
    if not os.path.exists(PROJECTS_ROOT):
        return []

    projects = []
    for item in os.listdir(PROJECTS_ROOT):
        item_path = os.path.join(PROJECTS_ROOT, item)
        if os.path.isdir(item_path):
            # For now, we assume any folder is a project. 
            # In the future, we could check for .kicad_pro files.
            
            # Try to get last modified time
            try:
                mtime = os.path.getmtime(item_path)
                last_modified = datetime.datetime.fromtimestamp(mtime).strftime('%Y-%m-%d')
            except:
                last_modified = "Unknown"

            projects.append(Project(
                id=item,
                name=item,
                description=f"Project {item}", # Placeholder description
                path=item_path,
                last_modified=last_modified,
                thumbnail_url=f"/api/projects/{item}/thumbnail"
            ))
    
    return projects

import threading
import uuid
import time
import subprocess

# Global job store: {job_id: {status: str, message: str, percent: float, project_id: str, error: str, logs: list[str], type: str}}
jobs = {}

class CloneProgress(RemoteProgress):
    def __init__(self, job_id):
        super().__init__()
        self.job_id = job_id
        
    def update(self, op_code, cur_count, max_count=None, message=''):
        if self.job_id in jobs:
            job = jobs[self.job_id]
            # Calculate percentage if max_count is available
            percent = 0
            if max_count:
                percent = (cur_count / max_count) * 100
                
            job['percent'] = percent
            job['message'] = message or f"Processing... {int(percent)}%"
            # Add to logs only if message makes sense
            if message:
                job['logs'].append(f"[GIT] {message}")

def _run_clone_job(job_id: str, repo_url: str):
    job = jobs[job_id]
    
    # Extract project name
    project_name = repo_url.rstrip('/').split('/')[-1]
    if project_name.endswith('.git'):
        project_name = project_name[:-4]
        
    target_path = os.path.join(PROJECTS_ROOT, project_name)
    
    if os.path.exists(target_path):
        job['status'] = 'failed'
        job['error'] = f"Project '{project_name}' already exists"
        job['logs'].append(f"Error: Project '{project_name}' already exists")
        return

    try:
        job['logs'].append(f"Cloning {repo_url} into {target_path}...")
        # Prevent git from asking for credentials (avoid hanging)
        env = os.environ.copy()
        env['GIT_TERMINAL_PROMPT'] = '0'
        
        Repo.clone_from(
            repo_url, 
            target_path, 
            progress=CloneProgress(job_id),
            env=env
        )
        
        job['status'] = 'completed'
        job['percent'] = 100
        job['message'] = 'Import complete'
        job['project_id'] = project_name
        job['logs'].append("Clone successful.")
        
    except Exception as e:
        job['status'] = 'failed'
        job['error'] = str(e)
        job['logs'].append(f"Error: {str(e)}")
        # Cleanup
        if os.path.exists(target_path):
            try:
                shutil.rmtree(target_path)
            except:
                pass

def start_import_job(repo_url: str) -> str:
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "running",
        "message": "Starting import...",
        "percent": 0,
        "project_id": None,
        "error": None,
        "logs": [],
        "type": "import"
    }
    
    thread = threading.Thread(target=_run_clone_job, args=(job_id, repo_url))
    thread.daemon = True
    thread.start()
    
    return job_id

def get_job_status(job_id: str):
    return jobs.get(job_id)

# Workflow Jobs
def _find_cli_path():
    # Check standard Mac path first
    mac_path = "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"
    if os.path.exists(mac_path):
        return mac_path
    return "kicad-cli" # Fallback to PATH

def _run_workflow_job(job_id: str, project_id: str, workflow_type: str):
    job = jobs[job_id]
    
    try:
        projects = get_registered_projects()
        project = next((p for p in projects if p.id == project_id), None)
        if not project:
            raise ValueError("Project not found")

        job['logs'].append(f"Starting workflow: {workflow_type}")
        cli_path = _find_cli_path()
        job['logs'].append(f"Using KiCAD CLI: {cli_path}")

        # Find .kicad_pro file
        pro_file = None
        for file in os.listdir(project.path):
            if file.endswith(".kicad_pro"):
                pro_file = file
                break
        
        if not pro_file:
            raise ValueError(".kicad_pro file not found in project root")

        # Determine output ID
        # IDs from user request:
        # Design: 28dab1d3-7bf2-4d8a-9723-bcdd14e1d814
        # Mfg: 9e5c254b-cb26-4a49-beea-fa7af8a62903
        # Render: 81c80ad4-e8b9-4c9a-8bed-df7864fdefc6
        output_id = ""
        if workflow_type == "design":
            output_id = "28dab1d3-7bf2-4d8a-9723-bcdd14e1d814"
        elif workflow_type == "manufacturing":
            output_id = "9e5c254b-cb26-4a49-beea-fa7af8a62903"
        elif workflow_type == "render":
            output_id = "81c80ad4-e8b9-4c9a-8bed-df7864fdefc6"
        else:
            raise ValueError(f"Unknown workflow type: {workflow_type}")

        jobset_file = "Outputs.kicad_jobset"
        # Check if jobset exists
        if not os.path.exists(os.path.join(project.path, jobset_file)):
             raise ValueError(f"{jobset_file} not found in project root")

        cmd = [
            cli_path,
            "jobset",
            "run",
            "-f", jobset_file,
            "--output", output_id,
            pro_file
        ]
        
        job['logs'].append(f"Command: {' '.join(cmd)}")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=project.path,
            text=True,
            bufsize=1,
            universal_newlines=True
        )

        for line in process.stdout:
            line = line.strip()
            if line:
                job['logs'].append(line)
                # Heuristic progress update could go here, but CLI doesn't always give percentage
        
        return_code = process.wait()
        
        if return_code == 0:
            job['percent'] = 100
            job['message'] = 'Processing outputs...'
            job['logs'].append("Job completed successfully.")
            
            # --- Git Push Logic ---
            try:
                job['logs'].append("Starting Git Sync...")
                repo = Repo(project.path)
                
                # Check for changes
                if not repo.is_dirty(untracked_files=True):
                    job['logs'].append("No changes detected to commit.")
                else:
                    # Add all changes
                    job['logs'].append("Staging files...")
                    repo.git.add('.')
                    job['logs'].append("Files staged.")
                    
                    # Commit
                    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    commit_message = f"Generated {workflow_type} outputs - {timestamp}"
                    job['logs'].append(f"Committing with message: '{commit_message}'")
                    
                    # Set local config for this commit to ensure it works even if global config is missing
                    # Or just use author argument in commit
                    repo.git.commit(
                        m=commit_message, 
                        author="KiCAD Prism <prism@pixxel.co.in>"
                    )
                    job['logs'].append("Commit created.")
                    
                    # Push
                    job['logs'].append("Pushing to remote...")
                    # Disable interactive prompt for push
                    env = os.environ.copy()
                    env['GIT_TERMINAL_PROMPT'] = '0'
                    
                    origin = repo.remote(name='origin')
                    push_info = origin.push(env=env)
                    
                    # Check push results
                    for info in push_info:
                        if info.flags & info.ERROR:
                            raise Exception(f"Push failed: {info.summary}")
                            
                    job['logs'].append("Successfully pushed to remote.")
                    
            except Exception as e:
                job['logs'].append(f"Git Sync Warning: {str(e)}")
                # We don't fail the job if push fails, just warn
            # ----------------------

            job['status'] = 'completed'
            job['message'] = 'Workflow completed successfully'
            
        else:
            job['status'] = 'failed'
            job['error'] = f"Process exited with code {return_code}"
            job['logs'].append(f"Job failed with exit code {return_code}")

    except Exception as e:
        job['status'] = 'failed'
        job['error'] = str(e)
        job['logs'].append(f"Error: {str(e)}")


def start_workflow_job(project_id: str, workflow_type: str) -> str:
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "running",
        "message": "Queued...",
        "percent": 0,
        "project_id": project_id,
        "error": None,
        "logs": [],
        "type": workflow_type
    }
    
    thread = threading.Thread(target=_run_workflow_job, args=(job_id, project_id, workflow_type))
    thread.daemon = True
    thread.start()
    
    return job_id

def get_project_thumbnail_path(project_id: str) -> Optional[str]:
    projects = get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        return None
        
    thumbnail_dir = os.path.join(project.path, "assets", "thumbnail")
    
    if not os.path.exists(thumbnail_dir):
        return None
        
    # Find first image file
    for file in os.listdir(thumbnail_dir):
        if file.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
            return os.path.join(thumbnail_dir, file)
            
    return None

def find_schematic_file(project_path: str) -> Optional[str]:
    """Find the main .kicad_sch file in project root."""
    for file in os.listdir(project_path):
        if file.endswith(".kicad_sch"):
            return os.path.join(project_path, file)
    return None

def find_pcb_file(project_path: str) -> Optional[str]:
    """Find the main .kicad_pcb file in project root."""
    for file in os.listdir(project_path):
        if file.endswith(".kicad_pcb"):
            return os.path.join(project_path, file)
    return None

def find_3d_model(project_path: str) -> Optional[str]:
    """Find the .glb or .step model in Design-Outputs/3DModel/."""
    model_dir = os.path.join(project_path, "Design-Outputs", "3DModel")
    if not os.path.exists(model_dir):
        return None
    
    for file in os.listdir(model_dir):
        if file.lower().endswith((".glb", ".step", ".stp")):
            return os.path.join(model_dir, file)
    return None

def find_ibom_file(project_path: str) -> Optional[str]:
    """Find the iBoM HTML file in Design-Outputs/."""
    outputs_dir = os.path.join(project_path, "Design-Outputs")
    if not os.path.exists(outputs_dir):
        return None
    
    for file in os.listdir(outputs_dir):
        if "ibom" in file.lower() and file.endswith(".html"):
            return os.path.join(outputs_dir, file)
    return None

def get_subsheets(project_path: str, main_schematic: str) -> List[str]:
    """Find all .kicad_sch files in project root and Subsheets directory."""
    subsheets = []
    main_name = os.path.basename(main_schematic)
    
    # Check root directory
    for file in os.listdir(project_path):
        if file.endswith(".kicad_sch") and file != main_name:
            subsheets.append(file)
            
    # Check Subsheets directory
    subsheets_dir = os.path.join(project_path, "Subsheets")
    if os.path.isdir(subsheets_dir):
        for file in os.listdir(subsheets_dir):
            if file.endswith(".kicad_sch"):
                # Return path relative to project root (e.g. "Subsheets/MySheet.kicad_sch")
                subsheets.append(os.path.join("Subsheets", file))
                
    return subsheets
