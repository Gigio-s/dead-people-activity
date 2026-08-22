@echo off
setlocal
cd /d "%~dp0"

REM ============================================================
REM  DEAD PEOPLE ACTIVITY - AGGIORNAMENTO FESTIVAL
REM ============================================================
REM  Uso normale: raccoglie, pubblica, geocodifica e aggiorna GitHub.
REM  Uso di prova: aggiorna_festival.bat test
REM                crea solo la coda senza modificare il sito o GitHub.
REM ============================================================

echo ============================================================
echo   DEAD PEOPLE ACTIVITY - AGGIORNAMENTO FESTIVAL
echo ============================================================
echo.
echo Fonti festival attive: Resurrection, Barcelona Rock Fest,
echo Sonar, Bilbao BBK Live, Monegros e NOS Alive.
echo I concerti e i tour vengono esclusi da questa pipeline.
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

if /I "%~1"=="test" goto :test

echo [%date% %time%] --- BACKUP DATI PRIMA DELL'AGGIORNAMENTO ---
%DPA_PYTHON% "coordinate eventi\ingest.py" --backup
if errorlevel 1 goto :errore

echo [%date% %time%] --- RACCOLTA E CONTROLLO FESTIVAL ---
%DPA_PYTHON% fonti_europee.py --festival-only --enqueue-festivals --max-pages 30 --delay 1.5 --output "..\assets\data\events_festival_pending.json"
if errorlevel 1 goto :errore

echo [%date% %time%] --- PUBBLICAZIONE FESTIVAL APPROVATI ---
%DPA_PYTHON% "coordinate eventi\ingest.py" --approva-festival-prefisso "europa:"
if errorlevel 1 goto :errore

echo [%date% %time%] --- ARCHIVIO EVENTI PASSATI ---
%DPA_PYTHON% "coordinate eventi\ingest.py" --archivia-passati
if errorlevel 1 goto :errore

echo [%date% %time%] --- COORDINATE FESTIVAL ---
%DPA_PYTHON% "coordinate eventi\coordinate_eventi.py" --apply
if errorlevel 1 goto :errore
%DPA_PYTHON% "coordinate eventi\geocodifica_coordinate.py" --apply --limit 100 --delay 2.5 --retry-incerti-giorni 7 --tipo festival --fonte-prefisso "europa:"
if errorlevel 1 goto :errore

echo [%date% %time%] --- AGGIORNAMENTO GITHUB ---
git -C "%~dp0.." add -A
if errorlevel 1 goto :errore
git -C "%~dp0.." diff --cached --quiet
if errorlevel 1 (
    git -C "%~dp0.." commit -m "Aggiornamento festival (auto)"
    if errorlevel 1 goto :errore
) else (
    echo [%date% %time%] Nessuna modifica nuova da committare.
)
git -C "%~dp0.." pull --rebase origin main
if errorlevel 1 goto :errore
git -C "%~dp0.." push origin main
if errorlevel 1 goto :errore

echo.
echo [%date% %time%] FATTO: festival pubblicati e sito aggiornato online.
pause
exit /b 0

:test
echo MODALITA TEST: nessuna pubblicazione e nessun push.
%DPA_PYTHON% fonti_europee.py --festival-only --max-pages 30 --delay 1.5 --output "..\assets\data\events_festival_pending.json"
if errorlevel 1 goto :errore
echo.
echo FATTO: coda festival di prova aggiornata.
echo File: assets\data\events_festival_pending.json
pause
exit /b 0

:errore
echo.
echo [%date% %time%] ERRORE: aggiornamento festival interrotto.
echo Nessun push successivo verra eseguito. Puoi rilanciare il BAT.
pause
exit /b 1
