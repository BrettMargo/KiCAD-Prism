# Custom Project Names Feature

This feature allows users to set custom display names for their KiCAD projects that override the default folder names in the KiCAD-Prism interface.

## How It Works

### Backend Changes
- Extended `.prism.json` schema to include optional `project_name` field
- Updated `PathConfig` model to support custom project names
- Added API endpoints for managing project names
- Modified project listing to use custom names when available

### Frontend Changes
- Updated TypeScript interfaces to include `display_name` field
- Modified all project display components to use custom names
- Added project name editing capability
- Updated search and filtering to work with custom names

## Usage

### Setting a Custom Project Name

1. Navigate to your project directory
2. Create or edit the `.prism.json` file
3. Add a `project_name` field at the top level:

```json
{
  "project_name": "My Custom Project Name",
  "paths": {
    "schematic": "*.kicad_sch",
    "pcb": "*.kicad_pcb",
    "designOutputs": "Design-Outputs",
    "manufacturingOutputs": "Manufacturing-Outputs",
    "documentation": "docs",
    "thumbnail": "assets/thumbnail",
    "readme": "README.md",
    "jobset": "Outputs.kicad_jobset"
  }
}
```

### Name Resolution Priority

The system uses the following priority for displaying project names:

1. **Custom name** from `.prism.json` `project_name` field
2. **KiCAD filename** for Type-2 imports (`.kicad_pro` filename)
3. **Folder name** as fallback (existing behavior)
4. **Repository name** for Type-1 imports

### API Endpoints

#### Get Project Name
```
GET /api/projects/{project_id}/name
```

Returns:
```json
{
  "display_name": "Custom Name",
  "fallback_name": "folder-name"
}
```

#### Update Project Name
```
PUT /api/projects/{project_id}/name
Content-Type: application/json

{
  "display_name": "New Custom Name"
}
```

Returns:
```json
{
  "display_name": "New Custom Name",
  "message": "Project name updated successfully"
}
```

## Backward Compatibility

- Existing projects without `.prism.json` continue to work unchanged
- The `project_name` field is completely optional
- All existing functionality remains intact
- Projects fall back to folder names when no custom name is set

## File Structure

```
project-directory/
├── .prism.json          # Configuration file with custom name
├── project.kicad_pro     # KiCAD project file
├── project.kicad_sch     # Schematic file
├── project.kicad_pcb     # PCB file
└── ...                   # Other project files
```

## Implementation Details

### Backend Components
- `path_config_service.py`: Extended to handle project names
- `project_service.py`: Updated to include display names in project listings
- `projects.py`: New API endpoints for name management

### Frontend Components
- `workspace.tsx`: Updated to display custom names
- `project-card.tsx`: Modified to use display names
- `project-name-editor.tsx`: New component for editing names
- `project-name-api.ts`: API service for name management

This feature provides flexible project naming while maintaining full backward compatibility with existing projects.
