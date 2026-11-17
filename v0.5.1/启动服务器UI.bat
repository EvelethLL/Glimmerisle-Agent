@echo off
rem Glimmerisle Agent 0.5.1 - headless console launcher
rem Keep this file ASCII-only: cmd codepage differences would garble Chinese text.
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js not found. Install Node.js 20+ first: https://nodejs.org/
  pause
  exit /b 1
)

if not exist "%ROOT%node_modules" (
  echo [*] node_modules missing, running npm install ...
  call npm install
  if errorlevel 1 (
    echo [X] npm install failed. Check network / proxy, then retry.
    pause
    exit /b 1
  )
)

rem Electron hosts may leak this flag; server.js runs on plain Node, keep it clean.
set "ELECTRON_RUN_AS_NODE="

echo.
echo   Console: http://127.0.0.1:3210
echo   Data   : %ROOT%data
echo   Press Ctrl+C to stop.
echo.

node "%ROOT%src\server.js"
echo.
echo [*] server exited (code %errorlevel%)
pause
