@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install Python 3 from python.org and enable "Add Python to PATH".
  pause
  exit /b 1
)
py -m pip install -r requirements.txt pyinstaller
if errorlevel 1 (
  echo Failed to install build dependencies.
  pause
  exit /b 1
)
py -m PyInstaller --noconfirm --clean --onefile --windowed --name SikLab_Controller_App --distpath ..\ --workpath build --specpath build SikLab_Controller_App.py
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)
echo.
echo Done: ..\SikLab_Controller_App.exe
echo Put the EXE in the same SikLab project folder as index.html, then open it.
pause
