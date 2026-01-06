import os
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

class FileItem(BaseModel):
    name: str
    path: str  # relative to output folder
    size: int
    modified_date: str
    type: str  # file extension or 'folder'
    is_dir: bool

def get_files_recursive(directory: str, base_path: str = "") -> List[FileItem]:
    """
    Recursively list all files in a directory.
    
    Args:
        directory: Absolute path to directory
        base_path: Relative path from output folder root (for recursion)
    """
    items = []
    
    if not os.path.exists(directory):
        return items
    
    try:
        for entry in os.scandir(directory):
            # Skip hidden files and .DS_Store
            if entry.name.startswith('.'):
                continue
                
            rel_path = os.path.join(base_path, entry.name) if base_path else entry.name
            
            if entry.is_dir():
                items.append(FileItem(
                    name=entry.name,
                    path=rel_path,
                    size=0,
                    modified_date=datetime.fromtimestamp(entry.stat().st_mtime).isoformat(),
                    type="folder",
                    is_dir=True
                ))
                # Recursively add subdirectory contents
                items.extend(get_files_recursive(entry.path, rel_path))
            else:
                # Get file extension
                ext = os.path.splitext(entry.name)[1].lstrip('.')
                items.append(FileItem(
                    name=entry.name,
                    path=rel_path,
                    size=entry.stat().st_size,
                    modified_date=datetime.fromtimestamp(entry.stat().st_mtime).isoformat(),
                    type=ext or "file",
                    is_dir=False
                ))
    except PermissionError:
        pass
        
    return items

def get_project_files(project_path: str, output_type: str) -> List[FileItem]:
    """
    Get files from Design-Outputs or Manufacturing-Outputs.
    
    Args:
        project_path: Absolute path to project root
        output_type: 'design' or 'manufacturing'
    """
    folder_name = "Design-Outputs" if output_type == "design" else "Manufacturing-Outputs"
    output_dir = os.path.join(project_path, folder_name)
    
    return get_files_recursive(output_dir)
