# KiCAD Project Repository Structure

To ensure full compatibility with the KiCAD-Prism platform (including visualizers and automated workflows), board project repositories should follow this standardized folder layout.

## Root Directory

| File/Folder | Purpose |
|--------------|----------|
| `BoardName.kicad_pro` | Main KiCAD project file |
| `BoardName.kicad_sch` | Root schematic file |
| `BoardName.kicad_pcb` | PCB layout file |
| `Outputs.kicad_jobset` | **Required** for KiCAD Prism Workflows View |
| `README.md` | Board overview and specifications |
| `Subsheets/` | Directory for all hierarchical schematic subsheets |
| `assets/` | Images and renders for documentation |
| `docs/` | Board datasheets, ICDs, and test guides |
| `simulation/` | Simulation files and results |

---

## Repository Structure Visualization

```text
Board-Project-Repo/
├── BoardName.kicad_pro       # Main project file
├── BoardName.kicad_sch       # Root schematic
├── BoardName.kicad_pcb       # PCB layout
├── Outputs.kicad_jobset        # Workflow configuration
├── README.md                   # Documentation hub
├── Subsheets/                  # All secondary schematic files
│   └── sheet_name.kicad_sch
├── assets/                     # Visual assets (renders, images)
│   ├── images.png
│   ├── renders/Top-View.png
│   ├── renders/Bottom-View.png
│   └── thumbnail/BoardName-Blender-Render.png # Used as Project thumbnail in KiCAD Prism
├── docs/                       # Project documentation (ICDs, Bring-up logs)
├── simulation/                 # Simulation files (SPICE, etc.)
├── Design-Outputs/             # Auto-generated reference outputs (Workflows)
│   ├── BoardName.pdf
│   ├── 3DModel/BoardName.glb
│   ├── 3DModel/BoardName.step
│   ├── BoardName_iBoM.html
│   ├── BoardName.pdf
│   ├── BoardName.csv
│   └── BoardName.net
│   
└── Manufacturing-Outputs/      # Auto-generated fabrication outputs (Workflows)
    ├── Gerbers/
    └── BOM/
```

## Sub-Directories

### `Subsheets/`

Contains all hierarchical schematic pages (`.kicad_sch`) except for the root schematic. This keeps the root directory clean and allows KiCAD Prism to find subsheets automatically.

### `Design-Outputs/`

This folder is automatically managed by the **Workflows** feature in KiCAD Prism. It typically contains:

- `BoardName.pdf`: Full schematic PDF.
- `BoardName_iBoM.html`: Interactive BOM.
- `3DModel/BoardName.step`: PCB 3D model.

### `Manufacturing-Outputs/`

This folder is also managed by the **Workflows** feature and contains fabrication-ready files:

- `Gerbers/`: Gerber and drill files.
- `BOM/`: Precise manufacturing BOMs.
- `XY-Data/`: Pick-and-place files.

### `docs/`

This folder is managed by the **Documentation** feature in KiCAD Prism. Typically contains markdown files detailing various aspects of the board.
