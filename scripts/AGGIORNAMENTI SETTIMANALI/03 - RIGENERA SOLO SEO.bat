@echo off
setlocal
cd /d "%~dp0.."
call "genera_seo.bat"
exit /b %errorlevel%
