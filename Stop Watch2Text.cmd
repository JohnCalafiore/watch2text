@echo off
REM Stops the background copy of Watch2Text (run this before updating).
set FOUND=
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"127.0.0.1:3005 .*LISTENING"') do (
  taskkill /PID %%p /T /F >nul 2>&1
  set FOUND=1
)
if defined FOUND (echo Watch2Text stopped.) else (echo Watch2Text was not running.)
if not "%~1"=="nopause" pause
