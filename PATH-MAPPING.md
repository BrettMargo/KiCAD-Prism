# KiCAD Prism Path Mapping System

## Overview

KiCAD Prism now supports **flexible folder structures** for your KiCAD projects. You no longer need to follow a strict directory layout - the platform can auto-detect your project structure or you can explicitly configure paths via a `.prism.json` file.

## How It Works

Path resolution follows this priority order:

1. **Explicit `.prism.json`** - If present in project root, use configured paths
2. **Auto-detection** - Scan repository and infer structure based on common patterns
3. **Fallback defaults** - Use legacy hardcoded paths (Design-Outputs/, docs/, etc.)

## Configuration File

Create a `.prism.json` file in your project root to explicitly define paths:

```json
{
  "paths": {
    "schematic": "*.kicad_sch",
    "pcb": "*.kicad_pcb",
    "subsheets": "Subsheets",
    "designOutputs": "outputs/design",
    "manufacturingOutputs": "outputs/manufacturing",
    "documentation": "documentation",
    "thumbnail": "assets/thumbnail",
    "readme": "README.md",
    "jobset": "project.kicad_jobset"
  }
}
```

### Path Options

| Option | Description | Example |
|--------|-------------|---------|
| `schematic` | Main schematic file (glob pattern supported) | `*.kicad_sch` |
| `pcb` | PCB layout file (glob pattern supported) | `*.kicad_pcb` |
| `subsheets` | Directory containing hierarchical schematic sheets | `Subsheets` |
| `designOutputs` | Directory for design outputs (PDFs, 3D models, etc.) | `Design-Outputs` |
| `manufacturingOutputs` | Directory for manufacturing files (Gerbers, BOMs) | `Manufacturing-Outputs` |
| `documentation` | Directory for project documentation | `docs` |
| `thumbnail` | Directory containing project thumbnail images | `assets/thumbnail` |
| `readme` | README file name | `README.md` |
| `jobset` | KiCAD jobset file for workflows | `Outputs.kicad_jobset` |

## Auto-Detection

If no `.prism.json` exists, KiCAD Prism will automatically detect your project structure by:

- **Schematic/PCB**: Finds `.kicad_sch` and `.kicad_pcb` files in root
- **Subsheets**: Looks for directories named `*sheet*`, `*schematic*`, `pages/`, etc. containing `.kicad_sch` files
- **Design Outputs**: Searches for `*output*`, `*export*`, `*build*`, `*dist*` directories with PDFs/3D models
- **Manufacturing Outputs**: Searches for `*gerber*`, `*fab*`, `*mfg*`, `*manufacturing*` directories
- **Documentation**: Searches for `*doc*`, `*wiki*`, `*guide*`, `*manual*` directories with markdown files
- **Thumbnail**: Searches for `*assets*`, `*images*`, `*renders*`, `*thumbnail*` directories with images

## API Endpoints

### Get Current Configuration

```http
GET /api/projects/{project_id}/config
```

Returns the current path configuration and resolved absolute paths.

### Detect Paths (Preview)

```http
POST /api/projects/{project_id}/detect-paths
```

Runs auto-detection and returns detected paths without saving them. Useful for previewing what would be detected.

### Update Configuration

```http
PUT /api/projects/{project_id}/config
Content-Type: application/json

{
  "paths": {
    "schematic": "*.kicad_sch",
    "pcb": "*.kicad_pcb",
    "documentation": "docs"
  }
}
```

Saves the configuration to `.prism.json` in the project root.

## Examples

### Example 1: Flat Structure

```
my-project/
├── main.kicad_pro
├── main.kicad_sch
├── main.kicad_pcb
├── sheet1.kicad_sch
├── sheet2.kicad_sch
├── README.md
└── outputs/
    ├── schematic.pdf
    ├── pcb.step
    └── gerbers/
        ├── board.gbr
        └── drill.drl
```

`.prism.json`:
```json
{
  "paths": {
    "schematic": "main.kicad_sch",
    "pcb": "main.kicad_pcb",
    "designOutputs": "outputs",
    "manufacturingOutputs": "outputs/gerbers"
  }
}
```

### Example 2: KiCAD Default Structure

```
my-project/
├── my-project.kicad_pro
├── my-project.kicad_sch
├── my-project.kicad_pcb
├── my-project.kicad_jobset
├── README.md
├── subsheets/
│   ├── power.kicad_sch
│   └── mcu.kicad_sch
├── manufacturing/
│   ├── gerbers/
│   └── bom/
└── exports/
    ├── schematic.pdf
    └── step/
```

`.prism.json`:
```json
{
  "paths": {
    "schematic": "my-project.kicad_sch",
    "pcb": "my-project.kicad_pcb",
    "subsheets": "subsheets",
    "designOutputs": "exports",
    "manufacturingOutputs": "manufacturing",
    "jobset": "my-project.kicad_jobset"
  }
}
```

### Example 3: Documentation-Heavy Project

```
my-project/
├── board.kicad_pro
├── board.kicad_sch
├── board.kicad_pcb
├── README.md
├── wiki/
│   ├── getting-started.md
│   ├── hardware-guide.md
│   └── troubleshooting.md
└── releases/
    └── v1.0/
        ├── production_files/
        └── design_files/
```

`.prism.json`:
```json
{
  "paths": {
    "schematic": "board.kicad_sch",
    "pcb": "board.kicad_pcb",
    "documentation": "wiki",
    "designOutputs": "releases/v1.0/design_files",
    "manufacturingOutputs": "releases/v1.0/production_files"
  }
}
```

## Migration from Legacy Structure

If you have existing projects using the legacy KiCAD-Prism structure, they will continue to work without any changes. The auto-detection recognizes the standard folder names:

- `Design-Outputs/` → `designOutputs`
- `Manufacturing-Outputs/` → `manufacturingOutputs`
- `docs/` → `documentation`
- `Subsheets/` → `subsheets`
- `assets/thumbnail/` → `thumbnail`

To migrate to explicit configuration, simply run the auto-detection endpoint and save the results:

```bash
# Preview what would be detected
curl -X POST /api/projects/{id}/detect-paths

# Save the detected configuration
curl -X PUT /api/projects/{id}/config \
  -H "Content-Type: application/json" \
  -d '{"schematic": "*.kicad_sch", "pcb": "*.kicad_pcb", ...}'
```

## Troubleshooting

### Files Not Found

If KiCAD Prism reports files not found:

1. Check the auto-detected paths via `GET /api/projects/{id}/config`
2. Run `POST /api/projects/{id}/detect-paths` to see what was detected
3. Create a `.prism.json` file with explicit paths if auto-detection failed

### Path Validation

When updating configuration, the API validates paths against the actual filesystem:

- **Valid paths** are resolved to absolute paths
- **Missing paths** return warnings (for glob patterns)
- **Invalid paths** return errors (for explicit paths that don't exist)

### Glob Patterns

For `schematic` and `pcb` fields, you can use glob patterns:

- `*.kicad_sch` - Match any .kicad_sch file in root
- `project*.kicad_sch` - Match files starting with "project"
- `**/*.kicad_sch` - Match recursively (first match is used)

## Backward Compatibility

This system is fully backward compatible:

- Existing projects without `.prism.json` continue to work
- Default paths match the legacy structure
- No migration required unless you want explicit control

---

For more information, see the [KiCAD-Prism Repository Structure](./KICAD-PRJ-REPO-STRUCTURE.md) document.
