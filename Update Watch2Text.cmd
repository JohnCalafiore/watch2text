@echo off
REM Stop, pull the latest code, rebuild, and start again in the background.
cd /d "%~dp0"
call "%~dp0Stop Watch2Text.cmd" nopause
git pull || goto :fail
call npm install || goto :fail
call npm run build || goto :fail
wscript.exe "%~dp0watch2text-background.vbs"
echo.
echo Updated and running: http://localhost:3005/library
pause
exit /b
:fail
echo.
echo Update stopped because a step failed. Copy the error above and send it to Claude.
pause
