@echo off
setlocal
REM Versione ufficiale degli script coordinate: scripts\coordinate eventi
cd /d "%~dp0coordinate eventi"

echo ============================================================
echo   DEAD PEOPLE ACTIVITY - RICERCA COORDINATE REALI
echo ============================================================
echo.
echo Cerca solo i locali non ancora presenti nella cache.
echo La prima esecuzione puo richiedere alcuni minuti.
echo Vengono applicati soltanto risultati ad alta affidabilita.
echo.

where py >nul 2>&1
if not errorlevel 1 (
    py -3 geocodifica_coordinate.py --apply --limit 500 --delay 2.5 --retry-incerti-giorni 7
) else (
    python geocodifica_coordinate.py --apply --limit 500 --delay 2.5 --retry-incerti-giorni 7
)

if errorlevel 1 (
    echo.
    echo ERRORE: geocodifica non completata.
) else (
    echo.
    echo Geocodifica completata.
)
echo.
pause
endlocal
