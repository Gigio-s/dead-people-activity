@echo off
REM ============================================================
REM  Registra un'attivita' di Windows che aggiorna gli eventi
REM  DA SOLA ogni settimana (lunedi' alle 04:00).
REM  Doppio click su questo file una volta sola.
REM ============================================================

schtasks /create /tn "DeadPeopleActivity-AggiornaEventi" /tr "\"%~dp0aggiorna_eventi_auto.bat\" auto" /sc WEEKLY /d MON /st 04:00 /f

echo.
echo ============================================================
echo  Fatto: aggiornamento automatico ogni LUNEDI' alle 04:00.
echo  (Il PC deve essere acceso a quell'ora.)
echo.
echo  Per cambiare orario/giorno rilancia questo file cambiando
echo  /d MON /st 04:00 (es. /d SUN /st 22:00).
echo  Per rimuoverlo:
echo     schtasks /delete /tn "DeadPeopleActivity-AggiornaEventi" /f
echo ============================================================
pause
