@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo   DEAD PEOPLE ACTIVITY - VERIFICA FESTIVAL CANDIDATI
echo ============================================================
echo.
echo Controlla i candidati prioritari ma NON li attiva e NON fa push.
echo.

where py >nul 2>&1
if not errorlevel 1 (
    set "DPA_PYTHON=py -3"
) else (
    where python >nul 2>&1
    if errorlevel 1 (
        echo ERRORE: Python non trovato.
        pause
        exit /b 1
    )
    set "DPA_PYTHON=python"
)

%DPA_PYTHON% verifica_festival_candidati.py --limit 60 --workers 6
if errorlevel 1 goto :errore

echo.
echo FATTO: verifica completata senza modificare il sito.
echo File: assets\data\festival_sources_verificate.json
echo File: assets\data\festival_sources_da_controllare.json
pause
exit /b 0

:errore
echo.
echo ERRORE: verifica non completata. Nessun dato del sito e stato modificato.
pause
exit /b 1
