@echo off
REM ============================================================
REM  AGGIORNAMENTO SETTIMANALE AUTOMATICO (senza pausa).
REM  Lo lancia l'attivita' pianificata di Windows (pianifica_settimanale.bat),
REM  oppure puoi lanciarlo a mano.
REM  Cosa fa, in ordine:
REM    1) Raccoglie e pubblica i nuovi eventi da TUTTE le fonti attive
REM       (Ticketmaster, Dice, Skiddle, Resident Advisor)
REM    2) Toglie dalla mappa gli eventi gia' passati (li archivia)
REM    3) Aggiorna il sito online (git push)
REM  Le chiavi stanno in config.bat (non su GitHub).
REM ============================================================

cd /d "%~dp0"
if exist "%~dp0config.bat" call "%~dp0config.bat"

echo [%date% %time%] --- BACKUP DATI PRIMA DELL'AGGIORNAMENTO ---
python "coordinate eventi\ingest.py" --backup
if errorlevel 1 (
    echo [%date% %time%] ERRORE BACKUP: aggiornamento annullato.
    if not "%1"=="auto" pause
    exit /b 1
)

echo [%date% %time%] --- TICKETMASTER ---
python "coordinate eventi\ingest.py"
python "coordinate eventi\ingest.py" --approva-fonte ticketmaster

echo [%date% %time%] --- DICE.FM ---
python dice.py
python arricchisci_genere.py
python dice.py --approva

echo [%date% %time%] --- SKIDDLE ---
python skiddle.py
python skiddle.py --approva

echo [%date% %time%] --- RESIDENT ADVISOR ---
python residentadvisor.py
python residentadvisor.py --approva

echo [%date% %time%] --- Archivio eventi passati (rimossi dalla mappa) ---
python "coordinate eventi\ingest.py" --archivia-passati

echo [%date% %time%] --- Coordinate locali (cache + verifica prudente) ---
python "coordinate eventi\coordinate_eventi.py" --apply
python "coordinate eventi\geocodifica_coordinate.py" --apply --limit 100 --delay 2.5 --retry-incerti-giorni 7

echo [%date% %time%] --- Pubblico il sito online (git push) ---
git -C "%~dp0.." add -A
git -C "%~dp0.." commit -m "Aggiornamento settimanale eventi (auto)"
git -C "%~dp0.." pull --rebase
git -C "%~dp0.." push

echo [%date% %time%] FATTO.

REM Se lanciato a mano (doppio click) mostra la pausa; se schedulato (arg "auto") no.
if not "%1"=="auto" pause
