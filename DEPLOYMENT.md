# Deployment Guide

This guide provides instructions for setting up KiCAD Prism on a new machine.

## Prerequisites

1.  **Python 3.10+**: Required for the backend.
2.  **Node.js v18+ & NPM**: Required for the frontend.
3.  **Git**: Required for project management and workflows.
4.  **KiCAD 8.0 or 9.0**: Required for `kicad-cli` workflow execution.

---

## 1. Backend Setup (FastAPI)

Navigate to the `backend` directory:

```bash
cd backend
```

### Create Virtual Environment
```bash
python -m venv venv
# macOS/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate
```

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Configuration
The backend expects a directory named `project-database` to exist one level ABOVE the repository root.
```bash
# Example structure:
# /Users/name/Projects/
# ├── KiCAD-Prism/       (this repo)
# └── project-database/  (created by backend or manually)
```

### Running the Backend
```bash
python main.py
```
By default, it runs on `http://localhost:8000`.

---

## 2. Frontend Setup (React + Vite)

Navigate to the `frontend` directory:

```bash
cd frontend
```

### Install Dependencies
```bash
npm install
```

### Running the Frontend
```bash
npm run dev
```
By default, it runs on `http://localhost:5173`. Make sure the backend is running so the proxy works.

---

## 3. Windows-Specific Instructions

If your host server is based on **Windows**, follow these additional steps:

### KiCAD CLI Path
The backend currently searches for `kicad-cli` in a standard macOS path. You may need to update the path in `backend/app/services/project_service.py`:

```python
# Locate this function in project_service.py
def _find_cli_path():
    # macOS path:
    # mac_path = "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"
    
    # Windows path (example):
    windows_path = "C:\\Program Files\\KiCad\\9.0\\bin\\kicad-cli.exe"
    if os.path.exists(windows_path):
        return windows_path
    return "kicad-cli"
```

### Shell Execution
The workflows use `subprocess.Popen`. On Windows, ensure that `git` and `kicad-cli` are available in the System Environment Variables (PATH).

### Git Configuration
For the "Push to Remote" feature to work, ensure the machine has Git credentials configured globally or via a credential manager:
```powershell
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

---

## 4. Troubleshooting

- **CORS Issues**: Check `backend/app/main.py` to ensure the frontend's origin (e.g., `localhost:5173`) is allowed.
- **Git Hangs**: The platform sets `GIT_TERMINAL_PROMPT=0` to prevent hangs. If an import fails, check if the repository requires authentication.
- **Missing Jobsets**: Ensure your projects have an `Outputs.kicad_jobset` file in the root if you want to use the Workflows feature.
