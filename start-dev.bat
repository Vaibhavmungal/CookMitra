@echo off
REM FestiveCook dev launcher - double-click to start everything.
REM Backend (nodemon) + frontend each run in their own minimized window
REM inside an infinite restart loop, so neither stops after some time.
REM Close a window to stop that server. Logs: backend\backend-dev.log,
REM frontend\devserver.log
title FestiveCook Dev Launcher
cd /d "%~dp0"

echo Checking MongoDB service...
sc query MongoDB | find "RUNNING" >nul
if errorlevel 1 (
  echo MongoDB is not running - trying to start it [may need admin]...
  powershell -NoProfile -Command "Start-Service MongoDB" 2>nul
  timeout /t 4 /nobreak >nul
  sc query MongoDB | find "RUNNING" >nul
  if errorlevel 1 (
    echo WARNING: MongoDB still not running. Start it, then re-run this file.
    echo Continuing anyway - the backend will retry until MongoDB is up.
  ) else (
    echo MongoDB started.
  )
) else (
  echo MongoDB is running.
)

for %%P in (5000 3000) do (
  netstat -ano | find "LISTENING" | find ":%%P " >nul
  if errorlevel 1 (
    echo Port %%P is free.
  ) else (
    echo WARNING: port %%P is already in use - stop the old process first [see stop-dev.bat].
  )
)

echo Starting backend with auto-restart...
start "FestiveCook Backend" /min cmd /v:on /c "cd /d ""%~dp0backend"" && for /l %%n in (1,0,2) do ( call npm run dev ^>^> backend-dev.log 2^>^&1 & timeout /t 3 /nobreak ^>nul )"

echo Starting frontend with auto-restart...
start "FestiveCook Frontend" /min cmd /v:on /c "cd /d ""%~dp0frontend"" && for /l %%n in (1,0,2) do ( call npm start ^>^> devserver.log 2^>^&1 & timeout /t 3 /nobreak ^>nul )"

echo.
echo Both servers are starting in minimized windows.
echo App:     http://localhost:3000
echo API:     http://localhost:5000/api/health
echo To stop everything, run stop-dev.bat or close the two windows.
pause
