@echo off
REM Starts Watch2Text quietly every time you sign in to Windows, and starts it now.
cd /d "%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%STARTUP%\Watch2Text.vbs" echo CreateObject("WScript.Shell").Run """%~dp0watch2text-background.vbs""", 0, False
curl.exe -s -o nul --max-time 2 http://127.0.0.1:3005/ || wscript.exe "%~dp0watch2text-background.vbs"
echo.
echo Autostart is on. Watch2Text now runs in the background whenever you sign in.
echo Your library: http://localhost:3005/library
echo.
pause
