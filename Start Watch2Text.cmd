@echo off
REM Double-click to run Watch2Text in your browser. No PowerShell needed.
REM First run builds the app (about a minute); after that it starts in seconds.
cd /d "%~dp0"
if not exist ".next\BUILD_ID" (
  echo Building Watch2Text for the first time, this takes about a minute...
  call npm run build
)
echo Starting Watch2Text at http://localhost:3005 ...
start "" "http://localhost:3005"
call npx next start -p 3005
pause
