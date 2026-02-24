@echo off
echo Starting KiCAD Prism dev servers...

:: Start backend (uvicorn with venv)
start /min "KiCAD-Prism Backend" cmd /k "cd /d %~dp0backend && call venv\Scripts\activate.bat && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

:: Start frontend (vite)
start /min "KiCAD-Prism Frontend" cmd /k "cd /d %~dp0frontend && npm run dev -- --host"

echo Both servers started in minimized windows.
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:8000/docs
