@echo off
setlocal
cd /d "%~dp0.."
call "aggiorna_eventi_auto.bat"
exit /b %errorlevel%
