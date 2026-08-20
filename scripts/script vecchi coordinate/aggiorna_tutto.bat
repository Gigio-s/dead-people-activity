@echo off
REM ================================================================
REM  Dead People Activity - AGGIORNAMENTO COMPLETO (un solo click)
REM  Fa tutto, in ordine, con tutte le migliorie:
REM    A) TICKETMASTER : scarica -> pubblica (gia' filtrato per genere)
REM    B) DICE.FM      : scarica -> controlla il genere online -> pubblica
REM    C) Archivia gli eventi gia' passati
REM
REM  Chiavi: le legge da config.bat (TM_API_KEY e LASTFM_KEY).
REM  NOTA: il controllo genere di Dice usa MusicBrainz (~1 richiesta/sec):
REM        la prima volta con molti eventi puo' metterci qualche minuto,
REM        poi e' veloce grazie alla cache.
REM ================================================================

cd /d "%~dp0"

REM --- Carica le chiavi dal file locale config.bat ---
if exist "%~dp0config.bat" (
    call "%~dp0config.bat"
) else (
    echo  ! Manca config.bat con le chiavi ^(TM_API_KEY, LASTFM_KEY^).
)

echo.
echo ============================================================
echo   A) TICKETMASTER
echo ============================================================
echo == A1  Scarico e filtro eventi da tutta Europa ==
python "coordinate eventi\ingest.py"
echo == A2  Pubblico i nuovi Ticketmaster ==
python "coordinate eventi\ingest.py" --approva-fonte ticketmaster

echo.
echo ============================================================
echo   B) DICE.FM
echo ============================================================
echo == B1  Scarico gli eventi musicali dalle citta' europee ==
python dice.py
echo == B2  Controllo il genere di ogni artista online e pulisco ==
python arricchisci_genere.py
echo == B3  Pubblico solo gli eventi Dice col genere giusto ==
python dice.py --approva

echo.
echo ============================================================
echo   C) SKIDDLE  (solo se hai messo SKIDDLE_KEY in config.bat)
echo ============================================================
echo == C1  Scarico da Skiddle (gia' filtrato per genere) ==
python skiddle.py
echo == C2  Pubblico gli eventi Skiddle ==
python skiddle.py --approva

echo.
echo ============================================================
echo   D) MANUTENZIONE
echo ============================================================
echo == D1  Archivio gli eventi gia' passati ==
python "coordinate eventi\ingest.py" --archivia-passati

echo.
echo ================================================================
echo   FATTO. Mappa aggiornata (Ticketmaster + Dice).
echo   Da rivedere a mano se vuoi:
echo     assets\data\events_dice_incerti.json   (serate/festival senza genere)
echo     assets\data\events_dice_scartati.json  (fuori target)
echo ================================================================

REM --- Per aggiornare anche il SITO ONLINE (GitHub Pages), togli i REM sotto ---
REM git add -A
REM git commit -m "Aggiornamento automatico eventi"
REM git push

pause
