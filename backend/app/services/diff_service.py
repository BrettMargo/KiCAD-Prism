"""
Native Visual Diff Service

Generates visual diffs between commits using local kicad-cli.
"""

import os
import subprocess
import threading
import uuid
import shutil
import time
import json
from pathlib import Path
from typing import Optional, List, Dict
from app.services.project_service import get_registered_projects

# Global job store
# Structure: { job_id: { ... } }
diff_jobs: Dict[str, dict] = {}

# Configuration
MAX_JOB_AGE_SECONDS = 3600 * 24  # 24 hours

def _get_cli_command() -> str:
    """Find valid kicad-cli command."""
    # Check PATH first
    if shutil.which("kicad-cli"):
        return "kicad-cli"
    
    # Check common macOS paths
    mac_paths = [
        "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli",
        "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli", # Duplicate?
        os.path.expanduser("~/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli")
    ]
    
    for path in mac_paths:
        if os.path.exists(path):
            return path
            
    # Fallback (will likely fail if not found)
    return "kicad-cli"

CLI_CMD = _get_cli_command()
print(f"Resolved kicad-cli: {CLI_CMD}")


def _find_kicad_pro_file(directory: Path) -> Optional[Path]:
    try:
        if not directory.exists(): return None
        for file in directory.iterdir():
            if file.suffix == ".kicad_pro":
                return file
    except OSError:
        pass
    return None

def _find_kicad_pcb_file(directory: Path) -> Optional[Path]:
    try:
        if not directory.exists(): return None
        for file in directory.iterdir():
            if file.suffix == ".kicad_pcb":
                return file
    except OSError:
        pass
    return None

def _cleanup_job(job_id: str):
    """Remove a job directory and entry."""
    if job_id in diff_jobs:
        job = diff_jobs[job_id]
        output_dir = job.get('abs_output_path')
        if output_dir and os.path.exists(output_dir):
            try:
                shutil.rmtree(output_dir)
            except Exception as e:
                print(f"Error cleaning up job {job_id}: {e}")
        del diff_jobs[job_id]

def delete_job(job_id: str):
    """Public method to delete a job."""
    _cleanup_job(job_id)

def _snapshot_commit(project_path: Path, commit: str, destination: Path):
    """Snapshot a commit into destination using git archive."""
    destination.mkdir(parents=True, exist_ok=True)
    
    # git archive --format=tar commit | tar -x -C destination
    tar_cmd = ["git", "archive", "--format=tar", commit]
    
    # Run in repo root
    p1 = subprocess.Popen(tar_cmd, cwd=project_path, stdout=subprocess.PIPE)
    p2 = subprocess.Popen(["tar", "-x", "-C", str(destination)], stdin=p1.stdout)
    p1.stdout.close()
    p2.wait()
    
    if p2.returncode != 0:
        raise Exception(f"Failed to extract snapshot for {commit}")

def _get_pcb_layers(pcb_path: Path) -> List[str]:
    """
    Return comprehensive list of potential layers.
    KiCad CLI typically ignores layers that are empty/invalid for export.
    """
    layers = [
        # Copper
        "F.Cu", "B.Cu",
        # Technical
        "F.SilkS", "B.SilkS", 
        "F.Mask", "B.Mask", 
        "Edge.Cuts",
        "F.Paste", "B.Paste",
        # User / Fab / Assembly
        "F.Fab", "B.Fab",
        "F.CrtYd", "B.CrtYd",
        "F.Adhes", "B.Adhes",
        "User.Drawings", "User.Comments", "User.Eco1", "User.Eco2",
        "Dwgs.User", "Cmts.User", "Eco1.User", "Eco2.User", # Legacy names just in case
        "Margin"
    ]
    # Add Inner layers 1-30 just in case
    for i in range(1, 31):
        layers.append(f"In{i}.Cu")
        
    return layers
    
import re

def _colorize_svg(svg_path: Path, color: str):
    """
    Replaces black lines/fills in the SVG with the specified color.
    Assumes SVG was exported with --black-and-white.
    """
    if not svg_path.exists():
        return
        
    content = svg_path.read_text(encoding="utf-8")
    
    # Regex for black colors
    # Matches: stroke="#000000", stroke="black", stroke="rgb(0,0,0)", fill="..."
    # We want to replace the color value with our target color.
    
    # Pattern: (stroke|fill)="(?:\#000000|\#000|black|rgb\(0,\s*0,\s*0\))"
    pattern = r'(stroke|fill)="(?:\#000000|\#000|black|rgb\(0,\s*0,\s*0\))"'
    
    def replacer(match):
        attr = match.group(1)
        return f'{attr}="{color}"'
        
    content = re.sub(pattern, replacer, content)
    
    # Also handle style="..." blocks if used
    # style="...; fill:#000000; ..."
    style_pattern = r'(fill|stroke):(?:\#000000|\#000|black|rgb\(0,\s*0,\s*0\))'
    content = re.sub(style_pattern, f'\\1:{color}', content)
        
    svg_path.write_text(content, encoding="utf-8")

def _run_diff_generation(job_id: str, project_id: str, commit1: str, commit2: str):
    """Execute diff generation in background."""
    job = diff_jobs[job_id]
    
    try:
        # 1. Setup paths
        projects = get_registered_projects()
        project = next((p for p in projects if p.id == project_id), None)
        if not project:
            raise ValueError(f"Project '{project_id}' not found")
            
        project_path = Path(project.path)
        job_dir = (Path("/tmp/prism_diff") / job_id).resolve()
        job_dir.mkdir(parents=True, exist_ok=True)
        job['abs_output_path'] = str(job_dir)
        
        job['logs'].append(f"Started diff job for {project_id}")
        job['logs'].append(f"Output directory: {job_dir}")
        
        manifest = {
            "job_id": job_id,
            "commit1": commit1,
            "commit2": commit2,
            "schematic": True,
            "pcb": True,
            "sheets": [],
            "layers": []
        }
        
        # 1. Snapshot commits
        c1_dir = job_dir / commit1
        c2_dir = job_dir / commit2
        
        job['logs'].append(f"Snapshotting commit {commit1}...")
        _snapshot_commit(project_path, commit1, c1_dir)
        
        job['logs'].append(f"Snapshotting commit {commit2}...")
        _snapshot_commit(project_path, commit2, c2_dir)

        # We need to process both commits to ensure we catch files present in one but not other?
        # For simplicity, we scan both, but usually we iterate over the "New" structure 
        # or we just process both folders independently.
        
        # Define colors
        # Commit 1 (New) = GREEN
        # Commit 2 (Old) = RED
        COLOR_NEW = "#00AA00" # Slightly darker green for visibility on white
        COLOR_OLD = "#FF0000"
        
        for commit, directory, color in [(commit1, c1_dir, COLOR_NEW), (commit2, c2_dir, COLOR_OLD)]:
            # Recursive find for .kicad_pro (optional support)
            pro_file = next(directory.rglob("*.kicad_pro"), None)
            
            # Recursive find for .kicad_sch
            sch_file = next(directory.rglob("*.kicad_sch"), None)
            
            # Recursive find for .kicad_pcb
            pcb_file = next(directory.rglob("*.kicad_pcb"), None)
            
            if not sch_file and not pcb_file:
                job['logs'].append(f"No KiCad design files found in {commit} snapshot")
                continue
            
            # Export Schematics
            if sch_file:
                sch_out_dir = directory / "sch"
                sch_out_dir.mkdir(exist_ok=True)
                
                manifest["schematic"] = True
                job['logs'].append(f"Exporting Schematics for {commit}...")
                
                # Removed --all, assuming default behavior is all pages
                cmd = [
                    CLI_CMD, "sch", "export", "svg",
                    "--black-and-white",
                    "--no-background-color",
                    "--output", str(sch_out_dir),
                    str(sch_file)
                ]
                job['logs'].append(f"CMD: {' '.join(cmd)}")
                res = subprocess.run(cmd, capture_output=True, text=True)
                
                if res.returncode != 0:
                    job['logs'].append(f"SCH Export Failed (Code {res.returncode})")
                    job['logs'].append(f"STDOUT: {res.stdout}")
                    job['logs'].append(f"STDERR: {res.stderr}")
                else:
                    # Colorize
                    for svg in sch_out_dir.glob("*.svg"):
                        _colorize_svg(svg, color)

                    # Populate sheets list if this is the NEW commit (commit1)
                    if commit == commit1:
                        sheets = sorted([f.name for f in sch_out_dir.glob("*.svg")])
                        manifest["sheets"] = sheets
            
            # Export PCB
            if pcb_file:
                pcb_out_dir = directory / "pcb"
                pcb_out_dir.mkdir(exist_ok=True)
                
                manifest["pcb"] = True
                job['logs'].append(f"Exporting PCB Layers for {commit}...")
                
                # Standard KiCad layers
                layers = _get_pcb_layers(pcb_file)
                exported = []
                
                for layer in layers:
                    # Target filename e.g. F_Cu.svg
                    safe_layer_name = layer.replace('.', '_')
                    output_file = pcb_out_dir / f"{safe_layer_name}.svg"
                    
                    cmd = [
                        CLI_CMD, "pcb", "export", "svg",
                        "--layers", layer,
                        "--black-and-white",
                        "--no-background-color",
                        "--exclude-drawing-sheet",
                        "--page-size-mode", "2",
                        "--output", str(output_file),
                        str(pcb_file)
                    ]
                    
                    res = subprocess.run(cmd, capture_output=True, text=True)
                    if res.returncode == 0 and output_file.exists():
                        _colorize_svg(output_file, color)
                        exported.append(layer)
                    # We don't log every failure/skip to keep logs clean
                
                if commit == commit1:
                    manifest["layers"] = exported
            else:
                job['logs'].append(f"No .kicad_pcb found for {commit}")

        # DEBUG: Final file listing
        job['logs'].append("Final Job Directory Structure:")
        for root, dirs, files in os.walk(job_dir):
            for file in files:
                job['logs'].append(os.path.join(root, file))


        # Write manifest
        with open(job_dir / "manifest.json", "w") as f:
            json.dump(manifest, f, indent=2)

        job['status'] = 'completed'
        job['message'] = 'Ready'
        job['percent'] = 100
        job['logs'].append("Diff generation complete.")

    except Exception as e:
        job['status'] = 'failed'
        job['error'] = str(e)
        job['logs'].append(f"Critical Error: {str(e)}")


def start_diff_job(project_id: str, commit1: str, commit2: str) -> str:
    """Start async diff job."""
    job_id = str(uuid.uuid4())
    diff_jobs[job_id] = {
        "status": "running",
        "message": "Initializing...",
        "percent": 0,
        "created_at": time.time(),
        "project_id": project_id,
        "commit1": commit1,
        "commit2": commit2,
        "logs": [],
        "error": None,
        "abs_output_path": None
    }
    
    thread = threading.Thread(
        target=_run_diff_generation,
        args=(job_id, project_id, commit1, commit2)
    )
    thread.daemon = True
    thread.start()
    
    return job_id

def get_job_status(job_id: str) -> Optional[dict]:
    return diff_jobs.get(job_id)

def get_manifest(job_id: str):
    job = diff_jobs.get(job_id)
    if not job or job['status'] != 'completed':
        return None
    
    path = Path(job['abs_output_path']) / "manifest.json"
    if path.exists():
        with open(path, 'r') as f:
            return json.load(f)
    return None

def get_asset_path(job_id: str, asset_path: str) -> Optional[Path]:
    job = diff_jobs.get(job_id)
    if not job or job['status'] != 'completed':
        return None
        
    root = Path(job['abs_output_path'])
    full_path = root / asset_path
    
    # Security check
    try:
        if root in full_path.resolve().parents:
            if full_path.exists():
                return full_path
    except Exception:
        pass
    return None
