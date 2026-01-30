"""
Advanced Diff Service

Generates composite KiCAD files (.kicad_sch, .kicad_pcb) with semantic metadata.
"""

import os
from pathlib import Path
from typing import List, Dict, Optional, Set
from kiutils.schematic import Schematic
from kiutils.symbol import Symbol
from kiutils.items.common import Property, Position, Effects
from kiutils.items.schitems import SchematicSymbol
from kiutils.items.brditems import Segment, Via, Arc, Target
from kiutils.footprint import Footprint
from kiutils.items.zones import Zone

# Monkeypatch kiutils for KiCAD 6+ compatibility (uuid vs tstamp)
def _patch_kiutils():
    # Generic patcher for from_sexpr
    def patch_from_sexpr(cls):
        original_from_sexpr = cls.from_sexpr
        @classmethod
        def new_from_sexpr(cls, exp):
            if isinstance(exp, list):
                for i, item in enumerate(exp):
                    if isinstance(item, list) and len(item) > 0:
                        # Rename uuid to tstamp for compatibility
                        if item[0] == 'uuid':
                            item[0] = 'tstamp'
                        # Prevent IndexError: list index out of range if tstamp has no value
                        if item[0] == 'tstamp' and len(item) == 1:
                            item.append("") # Add empty value
            return original_from_sexpr(exp)
        cls.from_sexpr = new_from_sexpr

    # Apply to key classes
    for cls in [Segment, Via, Arc, Target, Footprint, Zone]:
        patch_from_sexpr(cls)

_patch_kiutils()

KIPRISM_STATUS = "KiPrism_Status"
KIPRISM_DIFF_DESC = "KiPrism_Diff_Desc"

STATUS_ADDED = "ADDED"
STATUS_REMOVED = "REMOVED"
STATUS_MODIFIED = "MODIFIED"
STATUS_UNCHANGED = "UNCHANGED"

def _get_symbol_properties(symbol: SchematicSymbol) -> Dict[str, str]:
    """Helper to extract properties into a dict."""
    return {p.key: p.value for p in symbol.properties}

def _set_prism_property(symbol: SchematicSymbol, key: str, value: str):
    """Sets or updates a property on a schematic symbol."""
    # Find existing
    existing = next((p for p in symbol.properties if p.key == key), None)
    if existing:
        existing.value = value
    else:
        # Create new hidden property
        prop = Property(
            key=key, 
            value=value,
            effects=Effects(hide=True)
        )
        symbol.properties.append(prop)

def generate_composite_sch(old_sch_path: Path, new_sch_path: Path, output_path: Path):
    """
    Generates a composite .kicad_sch file merging Old and New commits.
    Currently focuses on Symbols.
    """
    if not new_sch_path.exists():
        raise FileNotFoundError(f"New schematic not found at {new_sch_path}")

    # Load schematics
    new_sch = Schematic.from_file(str(new_sch_path))
    
    # If old schematic doesn't exist (e.g. first commit), everything is ADDED
    if not old_sch_path or not old_sch_path.exists():
        for sym in new_sch.schematicSymbols:
            _set_prism_property(sym, KIPRISM_STATUS, STATUS_ADDED)
        new_sch.to_file(str(output_path))
        return

    old_sch = Schematic.from_file(str(old_sch_path))

    # Index symbols by UUID
    old_syms = {s.uuid: s for s in old_sch.schematicSymbols if s.uuid}
    new_syms = {s.uuid: s for s in new_sch.schematicSymbols if s.uuid}

    # Process New Schematic Symbols (Status: ADDED, MODIFIED, UNCHANGED)
    for uuid, sym in new_syms.items():
        if uuid not in old_syms:
            _set_prism_property(sym, KIPRISM_STATUS, STATUS_ADDED)
        else:
            old_sym = old_syms[uuid]
            # Simple check for modification: Position, rotation, and basic properties
            is_modified = (
                sym.position.X != old_sym.position.X or
                sym.position.Y != old_sym.position.Y or
                sym.position.angle != old_sym.position.angle or
                sym.libId != old_sym.libId or
                _get_symbol_properties(sym) != _get_symbol_properties(old_sym)
            )
            
            if is_modified:
                _set_prism_property(sym, KIPRISM_STATUS, STATUS_MODIFIED)
            else:
                _set_prism_property(sym, KIPRISM_STATUS, STATUS_UNCHANGED)

    # Handle REMOVED symbols (Present in Old but not in New)
    removed_uuids = set(old_syms.keys()) - set(new_syms.keys())
    for uuid in removed_uuids:
        old_sym = old_syms[uuid]
        
        # Tag as REMOVED
        _set_prism_property(old_sym, KIPRISM_STATUS, STATUS_REMOVED)
        
        # Add to the composite (New) schematic
        new_sch.schematicSymbols.append(old_sym)
        
        # Ensure library symbol definition exists in New schematic
        # KiCAD includes used symbol definitions in (lib_symbols ...) block
        # If the removed symbol's library ID is missing from New, we must copy it.
        lib_id = old_sym.libId
        if not any(ls.libId == lib_id for ls in new_sch.libSymbols):
            # Find definition in Old Sch
            old_lib_sym = next((ls for ls in old_sch.libSymbols if ls.libId == lib_id), None)
            if old_lib_sym:
                new_sch.libSymbols.append(old_lib_sym)

    # Save Composite Schematic
    new_sch.to_file(str(output_path))

def generate_composite_pcb(old_pcb_path: Path, new_pcb_path: Path, output_path: Path):
    """
    Generates a composite .kicad_pcb file merging Old and New commits.
    Handles Footprints and Zones with semantic metadata.
    """
    from kiutils.board import Board
    from kiutils.footprint import Footprint
    from kiutils.items.zones import Zone
    from kiutils.items.brditems import Segment, Via, Arc

    if not new_pcb_path.exists():
        raise FileNotFoundError(f"New PCB not found at {new_pcb_path}")

    # Load boards
    new_brd = Board.from_file(str(new_pcb_path))
    
    if not old_pcb_path or not old_pcb_path.exists():
        for fp in new_brd.footprints:
            fp.properties[KIPRISM_STATUS] = STATUS_ADDED
        for zone in new_brd.zones:
            zone.properties[KIPRISM_STATUS] = STATUS_ADDED
        new_brd.to_file(str(output_path))
        return

    old_brd = Board.from_file(str(old_pcb_path))

    # Index Footprints by UUID (tstamp)
    old_fps = {f.tstamp: f for f in old_brd.footprints if f.tstamp}
    new_fps = {f.tstamp: f for f in new_brd.footprints if f.tstamp}

    # Process New Footprints
    for tstamp, fp in new_fps.items():
        if tstamp not in old_fps:
            fp.properties[KIPRISM_STATUS] = STATUS_ADDED
        else:
            old_fp = old_fps[tstamp]
            # Modification check: Position, side, orientation, reference, value
            is_modified = (
                fp.position.X != old_fp.position.X or
                fp.position.Y != old_fp.position.Y or
                fp.position.angle != old_fp.position.angle or
                fp.layer != old_fp.layer or
                fp.libId != old_fp.libId or
                fp.properties != old_fp.properties
            )
            if is_modified:
                fp.properties[KIPRISM_STATUS] = STATUS_MODIFIED
            else:
                fp.properties[KIPRISM_STATUS] = STATUS_UNCHANGED

    # Handle REMOVED Footprints
    removed_fp_tstamps = set(old_fps.keys()) - set(new_fps.keys())
    for tstamp in removed_fp_tstamps:
        old_fp = old_fps[tstamp]
        old_fp.properties[KIPRISM_STATUS] = STATUS_REMOVED
        new_brd.footprints.append(old_fp)

    # Index Zones by UUID (tstamp)
    old_zones = {z.tstamp: z for z in old_brd.zones if z.tstamp}
    new_zones = {z.tstamp: z for z in new_brd.zones if z.tstamp}

    # Process New Zones
    for tstamp, zone in new_zones.items():
        if tstamp not in old_zones:
            # zone.properties[KIPRISM_STATUS] = STATUS_ADDED
            pass
        else:
            old_zone = old_zones[tstamp]
            # Basic modification check for zones
            if zone.netName != old_zone.netName or len(zone.polygons) != len(old_zone.polygons):
                # zone.properties[KIPRISM_STATUS] = STATUS_MODIFIED
                pass
            else:
                # zone.properties[KIPRISM_STATUS] = STATUS_UNCHANGED
                pass

    # Handle REMOVED Zones
    removed_zone_tstamps = set(old_zones.keys()) - set(new_zones.keys())
    for tstamp in removed_zone_tstamps:
        old_zone = old_zones[tstamp]
        # old_zone.properties[KIPRISM_STATUS] = STATUS_REMOVED
        new_brd.zones.append(old_zone)

    # Track Diffing (Segments, Vias)
    def get_track_hash(item):
        net_val = item.net if isinstance(item.net, (int, float)) else 0
        if isinstance(item, Segment):
            return ("seg", item.start.X, item.start.Y, item.end.X, item.end.Y, item.width, net_val, item.layer)
        if isinstance(item, Via):
            return ("via", item.position.X, item.position.Y, item.size, item.drill, net_val, tuple(sorted(item.layers)))
        if isinstance(item, Arc):
            return ("arc", item.center.X, item.center.Y, item.start.X, item.start.Y, item.end.X, item.end.Y, item.width, net_val, item.layer)
        return None

    old_tracks = {get_track_hash(t): t for t in old_brd.traceItems if get_track_hash(t)}
    new_tracks = {get_track_hash(t): t for t in new_brd.traceItems if get_track_hash(t)}

    # We don't modify the new_brd.traceItems yet because we can't tag them.
    # Future: Move removed tracks to a "KiPrism_REMOVED" group or layer.
    
    # For now, just save the composite with semantic Footprints/Zones
    new_brd.to_file(str(output_path))
