# KiCAD Prism

KiCAD Prism is a modern web-based platform for visualizing and managing KiCAD projects. It provides integrated tools for schematic viewing, PCB visualization (2D/3D), interactive BOMs, and automated output generation workflows.

## Features

- **Project Explorer**: Browse and manage multiple KiCAD projects.
- **Async GitHub Import**: Import repositories directly from GitHub with real-time progress tracking.
- **Project Visualizer**:
    - High-performance Schematic and PCB viewing.
    - Integrated 3D model viewer.
    - Interactive BoM (iBoM) support.
- **Assets Portal**: Explore design and manufacturing outputs.
- **History Viewer**: View git commit history and browse files at specific points in time.
- **Workflow Automation**: Trigger `kicad-cli` jobs to generate latest design/manufacturing outputs and ray-traced renders directly from the browser.
- **Git Integration**: Automated committing and pushing of generated outputs to remote repositories.

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, ShadCN UI, Lucide Icons.
- **Backend**: FastAPI (Python 3.10+), GitPython.
- **Tools**: `kicad-cli` (v8.0+ or v9.0+).

---

## Getting Started

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions on setting up the platform.  
For the expected structure of imported KiCAD projects, see [KICAD-PRJ-REPO-STRUCTURE.md](./KICAD-PRJ-REPO-STRUCTURE.md).

## Project Structure

```text
KiCAD-Prism/
├── backend/            # FastAPI backend
│   ├── app/            # Application logic
│   └── main.py         # Entry point
├── frontend/           # React frontend
│   ├── src/            # Components, pages, hooks
│   └── index.html      # UI entry point
└── .gitignore          # Ignored files
```

## Workflow Requirements

1.  **Jobset File**: You **must** have a file named `Outputs.kicad_jobset` in the root of your project.
2.  **Output IDs**: The KiCAD Prism platform currently uses specific UUIDs for job execution. Ensure your jobset has outputs with these identifiers if you are using custom templates:
    - **Design**: `28dab1d3-7bf2-4d8a-9723-bcdd14e1d814`
    - **Manufacturing**: `9e5c254b-cb26-4a49-beea-fa7af8a62903`
    - **Render**: `81c80ad4-e8b9-4c9a-8bed-df7864fdefc6`
> Please feel free to tinker with the jobset file as per your needs. This was a last minute feature addition and I will continue to improve the genericity of the backend service. For now, either use the Jobset file provided under the `assets` directory or create your own jobset file and change the `start_workflow_job` and `_run_workflow_job` methods in project_service.py
3.  **Relative Paths**: Always use relative paths for subsheets (`Subsheets/file.kicad_sch`) and 3D models to ensure portability.

---

## Acknowledgements

KiCAD Prism is built upon several amazing open-source projects:

- **[ecad-viewer](https://github.com/Huaqiu-Electronics/ecad-viewer)** - Schematic and PCB rendering.
- **[Three.js](https://threejs.org/)** - 3D computer graphics.
- **[FastAPI](https://fastapi.tiangolo.com/)** - Backend web framework.
- **[React](https://reactjs.org/)** - Frontend UI library.
- **[Tailwind CSS](https://tailwindcss.com/)** & **[ShadCN UI](https://ui.shadcn.com/)** - Styling and components.
- **[Lucide Icons](https://lucide.dev/)** - Toolkit-neutral icons.
- **[GitPython](https://gitpython.readthedocs.io/)** - Interaction with git repositories.
- **[React Markdown](https://github.com/remarkjs/react-markdown)** - Markdown rendering.

Special thanks to the KiCAD team and the open-source hardware community.

## Future Plans

1. **Login and Access Control**: Currently the project just has a Dev Bypass. Users can choose to implement proper access control to their workspace or just use this platform as a public showcase of their projects.
2. **Generic Workflows**: The current workflow system is hardcoded to use specific UUIDs for job execution. I plan to make it more generic and allow users to define their own jobset files and output IDs.
3. **Collaboration**: The idea is to replicate the functionality of `commenting` that Altium Workspace provides on schematics and PCB layouts. I feel like this is a great value addition for team reviews. Current plan is to use [KiNotes](https://github.com/way2pramil/KiNotes) to implement this feature. Yet to figure out how applicable this would be. It's technically just markdown editing in the end :)
4. Integrate better Git Diff features: Currently planning to integrate [Kiri](https://github.com/leoheck/kiri) to provide visual diff features inside the history viewer section. This will allow users to see the changes between different commits in a more intuitive way.

## Customization

### Theme Colors (ShadCN UI)

The application use ShadCN UI for components, which can be customized via CSS variables. To change the theme colors (e.g., primary color, background, etc.):

1. Open `frontend/src/index.css`.
2. Locate the `:root` (for light mode) or `.dark` (for dark mode) blocks.
3. Update the HSL values for the desired variables.

**Example: Changing the Primary Color**
To change the primary color to a custom blue, update the `--primary` variable:

```css
:root {
  --primary: 221.2 83.2% 53.3%; /* HSL values without brackets */
}
```

You can use the [ShadCN UI Themes](https://ui.shadcn.com/themes) gallery to generate new color palettes.

