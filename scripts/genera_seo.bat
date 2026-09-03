@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo DEAD PEOPLE ACTIVITY - GENERAZIONE SEO
echo ============================================================
python genera_pagine_locali.py
if errorlevel 1 (
    echo.
    echo ERRORE: pagine locali non generate.
    pause
    exit /b 1
)
python genera_seo.py
if errorlevel 1 (
    echo.
    echo ERRORE: generazione SEO non completata.
    pause
    exit /b 1
)
echo.
echo FATTO: sitemap, robots e metadati aggiornati.
pause
