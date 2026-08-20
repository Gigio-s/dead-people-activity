@echo off
setlocal
cd /d "%~dp0"

REM ============================================================
REM  DEAD PEOPLE ACTIVITY - AGGIORNAMENTO FONTI FESTIVAL
REM ============================================================
REM  Pipeline separata dagli eventi settimanali.
REM  Legge soltanto le fonti attive in fonti_europee.json.
REM  Non modifica events.json, non esegue commit e non fa push.
REM  Il risultato va in assets\data\events_festival_pending.json.
REM ============================================================

echo ============================================================
echo   DEAD PEOPLE ACTIVITY - AGGIORNAMENTO FESTIVAL
echo ============================================================
echo.
echo Fonti festival: Resurrection Fest e Barcelona Rock Fest.
echo I concerti e i tour vengono esclusi da questa coda.
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

%DPA_PYTHON% fonti_europee.py --festival-only --max-pages 30 --delay 1.5 --output "..\assets\data\events_festival_pending.json"
if errorlevel 1 (
    echo.
    echo ERRORE: aggiornamento festival non completato.
    pause
    exit /b 1
)

echo.
echo FATTO: coda festival aggiornata.
echo File: assets\data\events_festival_pending.json
echo Nessun evento e stato ancora pubblicato.
echo.
pause
endlocal
