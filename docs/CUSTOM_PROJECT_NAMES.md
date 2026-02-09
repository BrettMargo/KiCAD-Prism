# Custom Project Names Feature

## Overview

This feature allows users to set custom display names for their KiCAD projects that override the default folder names throughout the KiCAD-Prism interface.

## How It Works

### Backend Implementation

1. **Extended `.prism.json` Schema**
   - Added optional `project_name` field at the top level
   - Maintains backward compatibility with existing files

2. **Path Config Service Updates**
   - `PathConfig` model now includes `project_name: Optional[str]`
   - `get_project_display_name()` function retrieves custom names
   - `save_path_config()` handles both paths and project names

3. **API Endpoints**
   - `GET /api/projects/{id}/name` - Get current project name
   - `PUT /api/projects/{id}/name` - Update project name
   - Enhanced project listing to include `display_name` field

4. **Project Service Integration**
   - `get_registered_projects()` now includes custom names
   - Monorepo structure API supports custom names
   - Maintains fallback to folder names

### Frontend Implementation

1. **TypeScript Interfaces**
   - `Project` interface includes `display_name?: string`
   - `MonorepoProject` interface includes `display_name?: string`
   - `PathConfig` interface includes `projectName?: string`

2. **Component Updates**
   - **Workspace**: Uses custom names in project cards and search
   - **Project Cards**: Display custom names with fallback
   - **Project Detail Page**: Shows custom name in title
   - **Path Config Dialog**: Added project name editing field

3. **API Integration**
   - `project-name-api.ts` service for name management
   - `project-name-editor.tsx` component for editing (standalone)
   - Integrated name editing into existing Path Config Dialog

## Usage

### Setting Custom Names

1. **Via Path Config Dialog** (Recommended)
   - Open any project
   - Click "Paths" button to open Project Settings
   - Enter custom name in "Project Name" field
   - Click "Save Configuration"

2. **Via `.prism.json` File** (Manual)
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

1. **Custom name** from `.prism.json` `project_name` field
2. **KiCAD filename** for Type-2 imports (`.kicad_pro` filename)
3. **Folder name** as fallback (existing behavior)
4. **Repository name** for Type-1 imports

## Features

### Implemented Features

- **Custom Project Names**: Set display names via `.prism.json`
- **UI Integration**: Edit names through Path Config Dialog
- **Search Support**: Custom names are searchable
- **Monorepo Support**: Works with subprojects
- **Backward Compatibility**: Existing projects unchanged
- **Fallback System**: Graceful degradation to folder names
- **Real-time Updates**: Changes reflect immediately

### API Endpoints

#### Get Project Name
```http
GET /api/projects/{project_id}/name
```

Response:
```json
{
  "display_name": "Custom Name",
  "fallback_name": "folder-name"
}
```

#### Update Project Name
```http
PUT /api/projects/{project_id}/name
Content-Type: application/json

{
  "display_name": "New Custom Name"
}
```

Response:
```json
{
  "display_name": "New Custom Name",
  "message": "Project name updated successfully"
}
```


## Migration Notes

### For Existing Projects
- No action required - projects continue to work with folder names
- Custom names are completely optional

### For New Projects
- Consider adding `project_name` to `.prism.json` during project setup
- Use descriptive names for better project identification

## Troubleshooting

### Common Issues

1. **Custom name not showing**
   - Check `.prism.json` syntax
   - Verify `project_name` field is at top level
   - Refresh project page

2. **Name not persisting**
   - Ensure Path Config Dialog saves successfully
   - Check file permissions on project directory
   - Verify backend API responses

3. **Search not working**
   - Clear browser cache
   - Check frontend build includes latest changes
   - Verify API returns display names

## Future Enhancements

### Potential Improvements
- [ ] Bulk rename projects
- [ ] Project name templates
- [ ] Name validation rules
- [ ] Import/export project names
- [ ] Name history/undo functionality

---

**Version**: 1.0  
**Last Updated**: 2025-02-09  
**Compatible**: KiCAD-Prism v0.0.0+
