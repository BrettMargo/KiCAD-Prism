"""
Project Discovery Service for KiCAD Prism

Scans repositories to discover multiple KiCAD projects (monorepo support).
"""

import os
import tempfile
import shutil
from pathlib import Path
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
from pydantic import BaseModel
from git import Repo


class DiscoveredProject(BaseModel):
    """A discovered KiCAD project within a repository."""
    name: str
    relative_path: str  # Path relative to repo root
    full_path: str      # Absolute path during discovery
    schematic_count: int
    pcb_count: int
    has_pro_file: bool = True
    description: Optional[str] = None


class DiscoveryResult(BaseModel):
    """Result of scanning a repository for KiCAD projects."""
    repo_url: str
    repo_name: str
    projects: List[DiscoveredProject]
    total_schematics: int
    total_pcbs: int


def discover_kicad_projects(repo_path: str) -> List[DiscoveredProject]:
    """
    Scan a repository for KiCAD projects.
    
    A KiCAD project is identified by the presence of a .kicad_pro file.
    Returns list of discovered projects with metadata.
    """
    repo_dir = Path(repo_path)
    projects = []
    
    # Find all .kicad_pro files recursively
    pro_files = list(repo_dir.rglob("*.kicad_pro"))
    
    for pro_file in pro_files:
        project_dir = pro_file.parent
        relative_path = project_dir.relative_to(repo_dir).as_posix()
        project_name = pro_file.stem  # Filename without extension
        
        # Count related files
        sch_files = list(project_dir.glob("*.kicad_sch"))
        pcb_files = list(project_dir.glob("*.kicad_pcb"))
        
        # Try to extract description from README if exists
        description = None
        readme_files = ["README.md", "readme.md", "README.txt", "readme.txt"]
        for readme_name in readme_files:
            readme_path = project_dir / readme_name
            if readme_path.exists():
                try:
                    with open(readme_path, 'r', encoding='utf-8', errors='ignore') as f:
                        first_line = f.readline().strip()
                        if first_line.startswith('#'):
                            description = first_line.lstrip('#').strip()
                        else:
                            description = first_line[:100]
                    break
                except:
                    pass
        
        projects.append(DiscoveredProject(
            name=project_name,
            relative_path=relative_path,
            full_path=str(project_dir),
            schematic_count=len(sch_files),
            pcb_count=len(pcb_files),
            has_pro_file=True,
            description=description
        ))
    
    # Sort by path depth (shallow first) then by name
    projects.sort(key=lambda p: (len(p.relative_path.split('/')), p.name))
    
    return projects


def clone_and_discover(repo_url: str, temp_dir: Optional[str] = None) -> DiscoveryResult:
    """
    Clone a repository to a temporary location and discover KiCAD projects.
    
    Args:
        repo_url: Git repository URL
        temp_dir: Optional existing temp directory to use
        
    Returns:
        DiscoveryResult with all discovered projects
    """
    repo_name = repo_url.rstrip('/').split('/')[-1].replace('.git', '')
    
    # Create temp directory if not provided
    cleanup_temp = temp_dir is None
    if temp_dir is None:
        temp_dir = tempfile.mkdtemp(prefix="kicad_discover_")
    
    try:
        # Shallow clone for faster discovery
        clone_path = Path(temp_dir) / repo_name
        Repo.clone_from(repo_url, str(clone_path), depth=1, single_branch=True)
        
        # Discover projects
        projects = discover_kicad_projects(str(clone_path))
        
        total_schematics = sum(p.schematic_count for p in projects)
        total_pcbs = sum(p.pcb_count for p in projects)
        
        return DiscoveryResult(
            repo_url=repo_url,
            repo_name=repo_name,
            projects=projects,
            total_schematics=total_schematics,
            total_pcbs=total_pcbs
        )
        
    finally:
        if cleanup_temp and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


def get_repo_name_from_url(repo_url: str) -> str:
    """Extract repository name from Git URL."""
    return repo_url.rstrip('/').split('/')[-1].replace('.git', '')
