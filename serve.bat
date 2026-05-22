@echo off
title UXPrototype Dev Server
cd /d "%~dp0"

:: Kill any existing process on port 8765 before starting
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8765 " ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%p /F >nul 2>&1
)

python dev_server.py 8765
echo.
echo  [server stopped — close this window when done]
pause > nul
