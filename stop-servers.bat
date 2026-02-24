@echo off
echo Stopping KiCAD Prism dev servers...

:: Kill uvicorn (Python) processes with the project's app module
taskkill /f /fi "WINDOWTITLE eq KiCAD-Prism Backend" >nul 2>&1
taskkill /f /im uvicorn.exe >nul 2>&1

:: Kill the frontend dev server
taskkill /f /fi "WINDOWTITLE eq KiCAD-Prism Frontend" >nul 2>&1

:: Kill any node processes running vite on port 5173
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Kill any python processes running on port 8000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo Servers stopped.
