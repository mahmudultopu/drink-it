@echo off
title Drink it
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run Drink it. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
rem open the browser a couple of seconds after the server starts
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js
pause
