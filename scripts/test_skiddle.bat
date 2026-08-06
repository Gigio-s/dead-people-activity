@echo off
REM ================================================================
REM  Dead People Activity - TEST SKIDDLE (solo prova, NON pubblica)
REM  Carica le chiavi da config.bat, raccoglie gli eventi Skiddle
REM  nella coda (events_pending.json) e li mostra. Niente va online.
REM ================================================================

cd /d "%~dp0"

if exist "%~dp0config.bat" (
    call "%~dp0config.bat"
) else (
    echo  ! Manca config.bat con le chiavi.
    pause
    exit /b 1
)

echo.
echo == Raccolgo gli eventi da Skiddle (in coda, NON pubblico) ==
python skiddle.py

echo.
echo == Mostro la coda Skiddle ==
python skiddle.py --show

echo.
echo ================================================================
echo   Fatto. Gli eventi sono solo IN CODA (events_pending.json).
echo   Per pubblicarli:  python skiddle.py --approva
echo ================================================================
pause
