@echo off
REM ================================================================
REM  Dead People Activity - TEST RESIDENT ADVISOR (prova, NON pubblica)
REM  Carica config.bat (RA_AREAS), raccoglie gli eventi RA nella coda
REM  (events_pending.json) e li mostra. Niente va online.
REM ================================================================

cd /d "%~dp0"

if exist "%~dp0config.bat" (
    call "%~dp0config.bat"
) else (
    echo  ! Manca config.bat.
    pause
    exit /b 1
)

echo.
echo == Raccolgo gli eventi da Resident Advisor (in coda, NON pubblico) ==
python residentadvisor.py

echo.
echo == Mostro la coda Resident Advisor ==
python residentadvisor.py --show

echo.
echo ================================================================
echo   Fatto. Gli eventi sono solo IN CODA (events_pending.json).
echo   Per pubblicarli:  python residentadvisor.py --approva
echo ================================================================
pause
