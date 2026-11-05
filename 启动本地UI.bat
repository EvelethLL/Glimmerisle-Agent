@echo off
rem Keep this file ASCII-only for cmd compatibility.
setlocal
set "ROOT=%~dp0"
set "ELECTRON=%~dp0node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON%" (
  echo Electron runtime not found: "%ELECTRON%"
  echo Run npm install before starting QQ Agent.
  pause
  exit /b 1
)
rem WorkBuddy/Electron hosts may leak this flag and force Electron into Node mode.
set "ELECTRON_RUN_AS_NODE="
rem This desktop app shares data\ with 启动服务器UI.bat - only ONE may run at a time
rem (instance lock: data\qq-agent.lock). When both are open the desktop build always
rem fails, and the only feedback is a modal box titled "Error" that vanishes on click.
if exist "%ROOT%data\qq-agent.lock" (
  echo [QQ Agent] data\qq-agent.lock exists - the server launcher is probably still running.
  echo           Desktop UI and server share the same data dir; close the other one first.
  echo           Real reason for any startup failure: data\boot-diag.log
  pause
  exit /b 1
)
pushd "%~dp0"
rem Use \., not a quoted path ending in a backslash: cmd otherwise passes a trailing quote to Electron.
start "" /b "%ELECTRON%" "%~dp0."
popd
exit /b 0
