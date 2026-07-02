@echo off
cd /d "%~dp0"
echo ============================================
echo  Processing Power - Local Game Server (Node)
echo ============================================
echo.
echo Starting server... browser will open automatically.
echo Press Ctrl+C to stop the server.
echo.
start /b cmd /c "ping -n 3 127.0.0.1 >/dev/null && start http://localhost:8080"
npx serve . -l 8080
pause
