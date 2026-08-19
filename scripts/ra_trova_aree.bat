@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo   DEAD PEOPLE ACTIVITY - SCOPRI AREE RESIDENT ADVISOR
echo ============================================================
echo.
echo Interroga RA e stampa la riga RA_AREAS pronta per config.bat.
echo Non modifica niente: fa solo letture.
echo.

where py >nul 2>&1
if not errorlevel 1 (
    py -3 ra_trova_aree.py %*
) else (
    python ra_trova_aree.py %*
)

echo.
pause
endlocal
