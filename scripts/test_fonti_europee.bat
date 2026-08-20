@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo   DEAD PEOPLE ACTIVITY - TEST FONTI EUROPEE
echo ============================================================
echo.
echo Modalita sicura: crea solo events_europee_test.json.
echo Non modifica gli eventi pubblicati e non esegue git push.
echo.

where py >nul 2>&1
if not errorlevel 1 (
    py -3 fonti_europee.py --max-pages 30 --delay 1.5
) else (
    python fonti_europee.py --max-pages 30 --delay 1.5
)

if errorlevel 1 (
    echo.
    echo ERRORE: test fonti europee non completato.
) else (
    echo.
    echo Test completato. Controlla assets\data\events_europee_test.json
)
echo.
pause
endlocal
