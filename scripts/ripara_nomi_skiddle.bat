@echo off
setlocal
cd /d "%~dp0"

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

echo ============================================================
echo   RIPARAZIONE NOMI EVENTI SKIDDLE
echo ============================================================
echo Recupero dei titoli ufficiali tramite ID Skiddle.
echo Viene creato un backup prima di modificare i dati.
echo.

%DPA_PYTHON% skiddle.py --ripara-nomi
set "DPA_EXIT=%ERRORLEVEL%"

echo.
if "%DPA_EXIT%"=="0" (
    echo FATTO: tutti i titoli mancanti sono stati recuperati.
) else (
    echo ATTENZIONE: alcuni titoli non sono stati recuperati.
    echo Puoi rilanciare questo file: verranno riprovati solo quelli mancanti.
)
pause
exit /b %DPA_EXIT%
