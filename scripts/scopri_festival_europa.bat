@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo   DEAD PEOPLE ACTIVITY - SCOPERTA FESTIVAL EUROPEI
echo ============================================================
echo.
echo Cerca nuove fonti ma NON pubblica e NON aggiorna GitHub.
echo Il risultato dovra essere verificato prima dell'attivazione.
echo.

if exist "%~dp0config.bat" call "%~dp0config.bat"

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

%DPA_PYTHON% scopri_festival_europa.py --output "..\assets\data\festival_sources_pending.json" --scartati "..\assets\data\festival_sources_scartate.json"
if errorlevel 1 goto :errore

echo.
echo FATTO: coda delle nuove fonti aggiornata.
echo File: assets\data\festival_sources_pending.json
echo Nessun festival e stato pubblicato o attivato.
pause
exit /b 0

:errore
echo.
echo ERRORE: scoperta non completata. Nessun dato del sito e stato modificato.
pause
exit /b 1
