@echo off
setlocal
REM Run as Administrator. Local classroom connections only, PRIVATE network profile.
net session >nul 2>&1
if errorlevel 1 (
  echo Right-click this file and choose Run as administrator.
  pause
  exit /b 1
)
netsh advfirewall firewall delete rule name="SikLab Local Controller TCP 8765" >nul 2>&1
netsh advfirewall firewall add rule name="SikLab Local Controller TCP 8765" dir=in action=allow protocol=TCP localport=8765 profile=private
netsh advfirewall firewall delete rule name="SikLab Local Discovery UDP 8766" >nul 2>&1
netsh advfirewall firewall add rule name="SikLab Local Discovery UDP 8766" dir=in action=allow protocol=UDP localport=8766 profile=private
echo.
echo SikLab firewall rules added for Private networks ONLY.
echo Make sure the classroom Wi-Fi network is classified as Private in Windows.
pause
