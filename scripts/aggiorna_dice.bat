@echo off
REM ============================================================
REM  Dead People Activity - Aggiornamento eventi da DICE.FM
REM  (fonte separata, staccata da Ticketmaster)
REM
REM  NON serve nessuna chiave.
REM  Flusso completo in un click:
REM    1) scarica tutti gli eventi musicali dalle citta' europee
REM    2) controlla il GENERE di ogni artista online (MusicBrainz)
REM       e smista: TIENI / INCERTI / SCARTATI
REM    3) archivia i passati
REM    4) pubblica solo i TIENI (genere giusto)
REM
REM  NOTA: il passo 2 usa MusicBrainz (max ~1 richiesta/sec), quindi la
REM  PRIMA volta con tanti eventi puo' metterci diversi minuti. Le volte
REM  dopo e' piu' veloce (cache degli artisti gia' visti).
REM ============================================================

cd /d "%~dp0"

REM (facoltativo) carica impostazioni/chiavi da config.bat (es. LASTFM_KEY)
if exist "%~dp0config.bat" call "%~dp0config.bat"

echo == 1/4  Scarico gli eventi musicali da Dice.fm (citta' europee) ==
python dice.py

echo == 2/4  Controllo il genere di ogni artista online e pulisco ==
python arricchisci_genere.py

echo == 3/4  Archivio eventi gia' passati ==
python ingest.py --archivia-passati

echo == 4/4  Pubblico solo gli eventi col genere giusto ==
python dice.py --approva

echo.
echo == FATTO. In mappa solo eventi Dice del genere giusto. ==
echo    Incerti da rivedere:  assets\data\events_dice_incerti.json
echo    Scartati (fuori target): assets\data\events_dice_scartati.json

REM --- Per aggiornare anche il SITO ONLINE (GitHub Pages), togli i REM sotto ---
REM git add -A
REM git commit -m "Aggiornamento eventi Dice"
REM git push

pause
