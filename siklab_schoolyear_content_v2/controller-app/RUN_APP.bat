@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install Python 3 from python.org and enable "Add Python to PATH".
  pause
  exit /b 1
)
py -m pip install -r requirements.txt
if errorlevel 1 (
  echo Failed to install SikLab Controller dependencies.
  pause
  exit /b 1
)
py SikLab_Controller_App.py
