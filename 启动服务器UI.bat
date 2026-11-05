@echo off
rem Keep this file ASCII-only for cmd compatibility.
rem QQ Agent 0.5 server launcher: equivalent of "npm run server" (node src/server.js).
rem Console address is printed by the server on startup (default http://127.0.0.1:3210).
setlocal
chcp 65001 >nul
set "ROOT=%~dp0"
pushd "%ROOT%"

where node >nul 2>nul
if errorlevel 1 (
  echo [QQ Agent] Node.js not found in PATH. Install Node 20+ or run npm install first.
  popd
  pause
  exit /b 1
)

if not exist "%ROOT%node_modules" (
  echo [QQ Agent] node_modules not found. Running npm install first...
  call npm install
  if errorlevel 1 (
    echo [QQ Agent] npm install failed. Fix the errors above and start again.
    popd
    pause
    exit /b 1
  )
)

if exist "%ROOT%data\qq-agent.lock" (
  echo [QQ Agent] Found data\qq-agent.lock - a server instance may already be running.
  echo           If the console at http://127.0.0.1:3210 is reachable, close that one first.
  echo           A stale lock file can be deleted if no instance is actually running.
)

echo [QQ Agent] Starting server: node src/server.js
echo [QQ Agent] Close this window or press Ctrl+C to stop the server.
node src\server.js

echo.
echo [QQ Agent] Server exited. If it stopped right away, check the message above
echo           ^(common cause: another instance is already running with the same data^).
popd
pause
exit /b 0
