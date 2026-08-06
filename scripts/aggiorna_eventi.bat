@echo off
REM ============================================================
REM  Dead People Activity - Aggiornamento giornaliero eventi
REM  Doppio click su questo file, oppure pianificalo con
REM  "Utilita' di pianificazione" di Windows per farlo da solo.
REM
REM  PRIMA VOLTA: imposta la chiave in modo permanente (una volta sola):
REM     setx TM_API_KEY "la_tua_chiave"
REM  poi chiudi e riapri il terminale.
REM ============================================================

cd /d "%~dp0"

REM Carica la chiave dal file locale config.bat
if exist "%~dp0config.bat" (
    call "%~dp0config.bat"
) else (
    echo  ! Manca config.bat con la chiave. Copia config.bat e inserisci TM_API_KEY.
)

if "%TM_API_KEY%"=="" (
    echo  ! TM_API_KEY vuota: Ticketmaster non verra' scaricato. Controlla config.bat
    echo.
)

echo == 1/3  Scarico e filtro eventi da tutta Europa ==
python ingest.py

echo == 2/3  Archivio gli eventi gia' passati ==
python ingest.py --archivia-passati

echo == 3/3  Pubblico i nuovi Ticketmaster (gia' filtrati per genere) ==
python ingest.py --approva-fonte ticketmaster

echo.
echo == FATTO. Mappa aggiornata. ==

REM --- Per aggiornare anche il SITO ONLINE (GitHub Pages), togli i REM sotto ---
REM git add -A
REM git commit -m "Aggiornamento automatico eventi"
REM git push

pause
