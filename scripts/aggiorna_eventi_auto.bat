@echo off
REM ============================================================
REM  AGGIORNAMENTO SETTIMANALE AUTOMATICO (senza pausa).
REM  Lo lancia l'attivita' pianificata di Windows (pianifica_settimanale.bat),
REM  oppure puoi lanciarlo a mano.
REM  Cosa fa, in ordine:
REM    1) Raccoglie e pubblica i nuovi eventi da TUTTE le fonti attive
REM       (Ticketmaster, Dice, Skiddle, Resident Advisor e concerti dei promoter/festival)
REM    2) Toglie dalla mappa gli eventi gia' passati (li archivia)
REM    3) Aggiorna il sito online (git push)
REM  Le chiavi stanno in config.bat (non su GitHub).
REM ============================================================

cd /d "%~dp0"
if exist "%~dp0config.bat" call "%~dp0config.bat"

where py >nul 2>&1
if not errorlevel 1 (
    set "DPA_PYTHON=py -3"
) else (
    where python >nul 2>&1
    if errorlevel 1 (
        echo [%date% %time%] ERRORE: Python non trovato. Aggiornamento annullato.
        if not "%1"=="auto" pause
        exit /b 1
    )
    set "DPA_PYTHON=python"
)

echo [%date% %time%] --- BACKUP DATI PRIMA DELL'AGGIORNAMENTO ---
%DPA_PYTHON% "coordinate eventi\ingest.py" --backup
if errorlevel 1 (
    echo [%date% %time%] ERRORE BACKUP: aggiornamento annullato.
    if not "%1"=="auto" pause
    exit /b 1
)

echo [%date% %time%] --- TICKETMASTER ---
%DPA_PYTHON% "coordinate eventi\ingest.py"
if errorlevel 1 goto :errore
%DPA_PYTHON% "coordinate eventi\ingest.py" --approva-fonte ticketmaster
if errorlevel 1 goto :errore

echo [%date% %time%] --- DICE.FM ---
%DPA_PYTHON% dice.py
if errorlevel 1 goto :errore
%DPA_PYTHON% arricchisci_genere.py
if errorlevel 1 goto :errore
%DPA_PYTHON% dice.py --approva
if errorlevel 1 goto :errore

echo [%date% %time%] --- SKIDDLE ---
%DPA_PYTHON% skiddle.py
if errorlevel 1 goto :errore
%DPA_PYTHON% skiddle.py --approva
if errorlevel 1 goto :errore

echo [%date% %time%] --- RESIDENT ADVISOR ---
%DPA_PYTHON% residentadvisor.py
if errorlevel 1 goto :errore
%DPA_PYTHON% residentadvisor.py --approva
if errorlevel 1 goto :errore

echo [%date% %time%] --- CONCERTI DA SITI FESTIVAL E PROMOTER ---
%DPA_PYTHON% fonti_europee.py --concert-only --enqueue-events --max-pages 30 --delay 1.5 --output "..\assets\data\events_concerti_europei_pending.json"
if errorlevel 1 goto :errore
%DPA_PYTHON% "coordinate eventi\ingest.py" --approva-prefisso "europa:"
if errorlevel 1 goto :errore

echo [%date% %time%] --- Archivio eventi passati (rimossi dalla mappa) ---
%DPA_PYTHON% "coordinate eventi\ingest.py" --archivia-passati
if errorlevel 1 goto :errore

echo [%date% %time%] --- Coordinate locali (cache + verifica prudente) ---
%DPA_PYTHON% "coordinate eventi\coordinate_eventi.py" --apply
if errorlevel 1 goto :errore
%DPA_PYTHON% "coordinate eventi\geocodifica_coordinate.py" --apply --limit 100 --delay 2.5 --retry-incerti-giorni 7
if errorlevel 1 goto :errore

echo [%date% %time%] --- Pagine locali SEO (solo dai dati gia approvati) ---
%DPA_PYTHON% genera_pagine_locali.py
if errorlevel 1 goto :errore
%DPA_PYTHON% genera_seo.py
if errorlevel 1 goto :errore

echo [%date% %time%] --- Pubblico il sito online (git push) ---
git -C "%~dp0.." add -A
if errorlevel 1 goto :errore
git -C "%~dp0.." diff --cached --quiet
if errorlevel 1 (
    git -C "%~dp0.." commit -m "Aggiornamento settimanale eventi (auto)"
    if errorlevel 1 goto :errore
) else (
    echo [%date% %time%] Nessuna modifica nuova da committare.
)
git -C "%~dp0.." pull --rebase
if errorlevel 1 goto :errore
git -C "%~dp0.." push
if errorlevel 1 goto :errore

echo [%date% %time%] FATTO.

REM Se lanciato a mano (doppio click) mostra la pausa; se schedulato (arg "auto") no.
if not "%1"=="auto" pause
exit /b 0

:errore
echo.
echo [%date% %time%] ERRORE: aggiornamento interrotto. Nessun push successivo verra eseguito.
echo Puoi rilanciare lo stesso file: backup e controlli duplicati proteggono i dati.
if not "%1"=="auto" pause
exit /b 1
