"""
Thumbnail Service for KiCAD Prism

Auto-generates project thumbnails using kicad-cli.
Stores generated thumbnails in {PROJECTS_ROOT}/.thumbnails/{project_id}/
"""
import os
import shutil
import subprocess
from typing import Optional

from app.services.diff_service import CLI_CMD
from app.services import project_service

# Cache directory for generated thumbnails
THUMBNAILS_ROOT = os.path.join(project_service.PROJECTS_ROOT, ".thumbnails")
os.makedirs(THUMBNAILS_ROOT, exist_ok=True)


def _get_thumbnail_dir(project_id: str) -> str:
    """Get the cache directory for a project's generated thumbnail."""
    return os.path.join(THUMBNAILS_ROOT, project_id)


def get_generated_thumbnail(project_id: str) -> Optional[str]:
    """Return the path to a cached generated thumbnail, or None."""
    thumb_dir = _get_thumbnail_dir(project_id)
    if not os.path.isdir(thumb_dir):
        return None
    for fname in os.listdir(thumb_dir):
        if fname.lower().endswith(('.svg', '.png', '.jpg', '.jpeg', '.webp')):
            return os.path.join(thumb_dir, fname)
    return None


def delete_thumbnail(project_id: str) -> None:
    """Remove cached thumbnail for a project."""
    thumb_dir = _get_thumbnail_dir(project_id)
    if os.path.isdir(thumb_dir):
        shutil.rmtree(thumb_dir)


def _export_pcb_thumbnail(pcb_path: str, output_path: str) -> bool:
    """Export a PCB SVG thumbnail using kicad-cli."""
    try:
        cmd = [
            CLI_CMD, "pcb", "export", "svg",
            "--layers", "F.Cu,B.Cu,F.SilkS,Edge.Cuts,F.Mask",
            "--page-size-mode", "2",
            "--exclude-drawing-sheet",
            "-o", output_path,
            pcb_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            print(f"[Thumbnail] kicad-cli pcb export failed: {result.stderr}")
            return False
        return os.path.exists(output_path)
    except Exception as e:
        print(f"[Thumbnail] PCB export error: {e}")
        return False


def _export_sch_thumbnail(sch_path: str, output_dir: str) -> Optional[str]:
    """Export a schematic SVG thumbnail using kicad-cli. Returns output file path."""
    try:
        cmd = [
            CLI_CMD, "sch", "export", "svg",
            "--pages", "1",
            "-o", output_dir,
            sch_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            print(f"[Thumbnail] kicad-cli sch export failed: {result.stderr}")
            return None
        # kicad-cli sch export svg writes files into the output directory
        # with the schematic name; find the generated file
        for fname in os.listdir(output_dir):
            if fname.lower().endswith('.svg'):
                return os.path.join(output_dir, fname)
        return None
    except Exception as e:
        print(f"[Thumbnail] Schematic export error: {e}")
        return None


def generate_thumbnail(project_id: str) -> Optional[str]:
    """
    Generate a thumbnail for a project. Tries PCB first, falls back to schematic.
    Returns the path to the generated thumbnail, or None on failure.
    """
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        print(f"[Thumbnail] Project {project_id} not found")
        return None

    project_path = project.path
    thumb_dir = _get_thumbnail_dir(project_id)

    # Clean any previous thumbnail
    if os.path.isdir(thumb_dir):
        shutil.rmtree(thumb_dir)
    os.makedirs(thumb_dir, exist_ok=True)

    # Try PCB first
    pcb_path = project_service.find_pcb_file(project_path)
    if pcb_path and os.path.exists(pcb_path):
        output_path = os.path.join(thumb_dir, "thumbnail.svg")
        if _export_pcb_thumbnail(pcb_path, output_path):
            print(f"[Thumbnail] Generated PCB thumbnail for {project_id}")
            return output_path

    # Fall back to schematic
    sch_path = project_service.find_schematic_file(project_path)
    if sch_path and os.path.exists(sch_path):
        result = _export_sch_thumbnail(sch_path, thumb_dir)
        if result:
            # Rename to thumbnail.svg for consistency
            target = os.path.join(thumb_dir, "thumbnail.svg")
            if result != target:
                os.rename(result, target)
            print(f"[Thumbnail] Generated schematic thumbnail for {project_id}")
            return target

    print(f"[Thumbnail] No PCB or schematic found for {project_id}")
    # Clean up empty directory
    if os.path.isdir(thumb_dir) and not os.listdir(thumb_dir):
        os.rmdir(thumb_dir)
    return None
