@echo off
rem Glimmerisle Agent 0.5.1 - desktop UI launcher
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

if not exist "%ROOT%node_modules\electron\dist\electron.exe" (
  echo [*] Electron runtime missing, installing electron@45.3.2 ...
  call npm i -D electron@45.3.2
  if errorlevel 1 (
    echo [X] Electron install failed. Check network / proxy, then retry.
    pause
    exit /b 1
  )
)

rem Electron hosts may leak this flag and force Electron into Node mode.
set "ELECTRON_RUN_AS_NODE="

echo [*] Starting desktop UI ...
start "" "%ROOT%node_modules\electron\dist\electron.exe" "%ROOT%"
exit /b 0
