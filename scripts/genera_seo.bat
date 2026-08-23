@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo DEAD PEOPLE ACTIVITY - GENERAZIONE SEO
echo ============================================================
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
