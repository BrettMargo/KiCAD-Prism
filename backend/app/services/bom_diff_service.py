import csv
import io
from typing import List, Dict, Any, Optional

def parse_bom_csv(csv_content: str) -> List[Dict[str, str]]:
    """Parse CSV content into a list of component dictionaries."""
    f = io.StringIO(csv_content)
    # KiCad export might have different delimiters or delimiters in quotes
    # kicad-cli sch export bom defaults to "," and """
    reader = csv.DictReader(f)
    return [row for row in reader]

def diff_boms(old_bom: List[Dict[str, str]], new_bom: List[Dict[str, str]], fields: List[str]) -> Dict[str, Any]:
    """
    Compare two BoMs and return a structured diff.
    Components are matched by 'Reference'.
    """
    old_map = {row.get('Reference', ''): row for row in old_bom if row.get('Reference')}
    new_map = {row.get('Reference', ''): row for row in new_bom if row.get('Reference')}
    
    all_refs = sorted(list(set(old_map.keys()) | set(new_map.keys())))
    
    changes = []
    summary = {"added": 0, "removed": 0, "changed": 0}
    
    # Ensure Reference is always in fields for display/comparison
    if 'Reference' not in fields:
        fields = ['Reference'] + fields

    for ref in all_refs:
        old_item = old_map.get(ref)
        new_item = new_map.get(ref)
        
        if not old_item:
            # Added
            summary["added"] += 1
            changes.append({
                "ref": ref,
                "status": "added",
                "new": {f: new_item.get(f, '') for f in fields}
            })
        elif not new_item:
            # Removed
            summary["removed"] += 1
            changes.append({
                "ref": ref,
                "status": "removed",
                "old": {f: old_item.get(f, '') for f in fields}
            })
        else:
            # Check for changes in the specified fields
            diffs = {}
            is_changed = False
            for f in fields:
                old_val = old_item.get(f, '')
                new_val = new_item.get(f, '')
                if old_val != new_val:
                    is_changed = True
                    diffs[f] = {"old": old_val, "new": new_val}
            
            if is_changed:
                summary["changed"] += 1
                changes.append({
                    "ref": ref,
                    "status": "changed",
                    "old": {f: old_item.get(f, '') for f in fields},
                    "new": {f: new_item.get(f, '') for f in fields},
                    "diffs": diffs
                })
            # If not changed, we don't necessarily need to return it unless we want a full table
            # For the diff viewer, we only show changes?
            # User might want to see the whole BoM with highlights. 
            # Let's return all items but with status 'unchanged'
            else:
                changes.append({
                    "ref": ref,
                    "status": "unchanged",
                    "old": {f: old_item.get(f, '') for f in fields},
                    "new": {f: new_item.get(f, '') for f in fields}
                })

    return {
        "summary": summary,
        "changes": changes,
        "fields": fields
    }
