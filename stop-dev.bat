@echo off
REM Stops the FestiveCook dev servers started by start-dev.bat
REM (also stops any other `node server.js` / `npm start` you run yourself).
title FestiveCook Stop Dev
taskkill /F /FI "WINDOWTITLE eq FestiveCook Backend*" 2>nul
taskkill /F /FI "WINDOWTITLE eq FestiveCook Frontend*" 2>nul
taskkill /F /IM node.exe 2>nul
echo All dev servers stopped.
pause
