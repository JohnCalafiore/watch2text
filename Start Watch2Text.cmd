@echo off
REM Double-click to open Watch2Text in your browser.
REM If it's already running in the background, this just opens the page.
cd /d "%~dp0"
curl.exe -s -o nul --max-time 2 http://127.0.0.1:3005/ && (
  start "" "http://localhost:3005/library"
  exit /b
)
if not exist ".next\BUILD_ID" (
  echo Building Watch2Text for the first time, this takes about a minute...
  call npm run build
)
echo Starting Watch2Text at http://localhost:3005 ...
start "" "http://localhost:3005/library"
call npx next start -p 3005 -H 127.0.0.1
pause
