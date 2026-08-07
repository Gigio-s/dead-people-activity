@echo off
REM ================================================================
REM  Dead People Activity - Scarica i confini dei paesi in locale
REM  (una volta sola). Cosi' la mappa non dipende da una CDN esterna.
REM ================================================================
cd /d "%~dp0"
echo Scarico i confini dei paesi europei (una volta sola)...
python scarica_confini.py
echo.
pause
