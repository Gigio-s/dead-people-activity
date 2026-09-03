@echo off
setlocal
cd /d "%~dp0.."
call "aggiorna_festival.bat"
exit /b %errorlevel%
