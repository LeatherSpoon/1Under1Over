@echo off
cd /d "%~dp0"
echo ============================================
echo  Processing Power - Mobile / LAN Server
echo ============================================
echo.

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress"`) do set LANIP=%%i
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "try { (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias Tailscale -ErrorAction Stop).IPAddress } catch {}"`) do set TSIP=%%i

if not defined LANIP (
  echo Could not detect a LAN IP address. Are you connected to Wi-Fi?
  pause
  exit /b 1
)

echo On your iPhone - same Wi-Fi network - open:
echo.
echo     http://%LANIP%:8080
echo.
if defined TSIP (
  echo Via Tailscale - works from anywhere, needs the Tailscale app on the phone:
  echo.
  echo     http://%TSIP%:8080
  echo.
)
echo Add ?debug to the URL for an on-device console.
echo.
echo Or scan with the iPhone camera:
echo.
echo http://%LANIP%:8080|npx -y qrcode-terminal
echo.
echo Press Ctrl+C to stop the server.
echo.
npx serve . -l 8080
pause
