@echo off
REM Stops Watch2Text and removes it from Windows sign-in.
cd /d "%~dp0"
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Watch2Text.vbs" 2>nul
call "%~dp0Stop Watch2Text.cmd" nopause
echo Autostart is off.
pause
