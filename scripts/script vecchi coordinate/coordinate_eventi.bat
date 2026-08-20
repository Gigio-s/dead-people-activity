@echo off
setlocal
REM Versione ufficiale degli script coordinate: scripts\coordinate eventi
cd /d "%~dp0coordinate eventi"

echo ============================================================
echo   DEAD PEOPLE ACTIVITY - CONTROLLO COORDINATE EVENTI
echo ============================================================
echo.
echo Verranno applicate solo coordinate di locali gia verificati.
echo Gli eventi dubbi resteranno nella coda di controllo.
echo Prima delle modifiche verra creato un backup automatico.
echo.

where py >nul 2>&1
if not errorlevel 1 (
    py -3 coordinate_eventi.py --apply
) else (
    python coordinate_eventi.py --apply
)

if errorlevel 1 (
    echo.
    echo ERRORE: controllo coordinate non completato.
) else (
    echo.
    echo Controllo coordinate completato.
)

echo.
pause
endlocal
