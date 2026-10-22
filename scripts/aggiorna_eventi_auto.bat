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
if not exist "%~dp0logs" mkdir "%~dp0logs"
set "DPA_LOG=%~dp0logs\aggiornamento_eventi.log"
set "DPA_STEP=avvio"
set "DPA_CAN_PUBLISH=1"
>>"%DPA_LOG%" echo.
>>"%DPA_LOG%" echo ============================================================
>>"%DPA_LOG%" echo [%date% %time%] NUOVO AGGIORNAMENTO

REM Non basta "where py": gli alias WindowsApps possono esistere ma non funzionare.
set "DPA_PYTHON="
if defined DPA_PYTHON_EXE if exist "%DPA_PYTHON_EXE%" set "DPA_PYTHON="%DPA_PYTHON_EXE%""
if not defined DPA_PYTHON if exist "%LOCALAPPDATA%\Python\bin\python.exe" set "DPA_PYTHON="%LOCALAPPDATA%\Python\bin\python.exe""
if not defined DPA_PYTHON (
    for /f "delims=" %%P in ('where python 2^>nul') do if not defined DPA_PYTHON (
        "%%P" -c "import sys" >nul 2>&1
        if not errorlevel 1 set "DPA_PYTHON="%%P""
    )
)
if not defined DPA_PYTHON (
    py -3 -c "import sys" >nul 2>&1
    if not errorlevel 1 set "DPA_PYTHON=py -3"
)
if not defined DPA_PYTHON (
    echo [%date% %time%] ERRORE: nessuna installazione Python funzionante trovata.
    >>"%DPA_LOG%" echo [%date% %time%] ERRORE: Python non trovato.
    if not "%1"=="auto" pause
    exit /b 1
)
echo [%date% %time%] Python: %DPA_PYTHON%
>>"%DPA_LOG%" echo [%date% %time%] Python: %DPA_PYTHON%

REM Il pull si fa PRIMA delle ore di raccolta solo quando la cartella e' pulita.
REM Se ci sono lavori in corso (es. Oasis/store), non li tocchiamo: al termine
REM verranno aggiunti al commit soltanto i file prodotti dalla pipeline eventi.
git -C "%~dp0.." rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    set "DPA_CAN_PUBLISH=0"
) else (
    set "DPA_REPO_DIRTY=0"
    for /f "delims=" %%G in ('git -C "%~dp0.." status --porcelain 2^>nul') do set "DPA_REPO_DIRTY=1"
)
if "%DPA_CAN_PUBLISH%"=="1" if "%DPA_REPO_DIRTY%"=="0" (
    call :fase "SINCRONIZZAZIONE GIT INIZIALE"
    git -C "%~dp0.." pull --rebase
    if errorlevel 1 (
        echo ATTENZIONE: pull non riuscito. I dati saranno aggiornati solo localmente.
        >>"%DPA_LOG%" echo [%date% %time%] Pull fallito: pubblicazione automatica disattivata.
        set "DPA_CAN_PUBLISH=0"
    )
)
if "%DPA_CAN_PUBLISH%"=="1" if "%DPA_REPO_DIRTY%"=="1" (
    echo NOTA: sono presenti modifiche locali. Saranno pubblicati solo i file degli eventi.
    >>"%DPA_LOG%" echo [%date% %time%] Repository non pulito: modalita pubblicazione selettiva.
)
if "%DPA_CAN_PUBLISH%"=="0" (
    echo ATTENZIONE: cartella non riconosciuta come repository Git. Push automatico disattivato.
    >>"%DPA_LOG%" echo [%date% %time%] Repository Git non disponibile: pubblicazione disattivata.
)

if /i "%1"=="check" (
    echo CONTROLLO SUPERATO: Python funzionante, script raggiungibile, stato Git verificato.
    >>"%DPA_LOG%" echo [%date% %time%] CONTROLLO PRELIMINARE SUPERATO.
    exit /b 0
)

REM Recupero rapido dopo un aggiornamento dati gia concluso: rigenera soltanto
REM SEO/sitemap e pubblica gli output eventi, senza interrogare nuovamente le API.
if /i "%1"=="publish" (
    call :fase "RECUPERO SEO E PUBBLICAZIONE DATI ESISTENTI"
    %DPA_PYTHON% genera_seo.py
    if errorlevel 1 goto :errore
    set "DPA_DATA_DONE=1"
    if not "%DPA_CAN_PUBLISH%"=="1" goto :solo_locale
    goto :pubblica_eventi
)

call :fase "BACKUP DATI PRIMA DELL'AGGIORNAMENTO"
%DPA_PYTHON% "coordinate eventi\ingest.py" --backup
if errorlevel 1 (
    echo [%date% %time%] ERRORE BACKUP: aggiornamento annullato.
    if not "%1"=="auto" pause
    exit /b 1
)

call :fase "TICKETMASTER"
%DPA_PYTHON% "coordinate eventi\ingest.py"
if errorlevel 1 goto :errore
%DPA_PYTHON% "coordinate eventi\ingest.py" --approva-fonte ticketmaster
if errorlevel 1 goto :errore

call :fase "DICE.FM"
%DPA_PYTHON% dice.py
if errorlevel 1 goto :errore
REM Massimo 400 artisti nuovi per esecuzione: ~7 minuti normalmente, mai piu ore.
%DPA_PYTHON% arricchisci_genere.py --max 400
if errorlevel 1 goto :errore
%DPA_PYTHON% dice.py --approva
if errorlevel 1 goto :errore

call :fase "SKIDDLE"
%DPA_PYTHON% skiddle.py
if errorlevel 1 goto :errore
%DPA_PYTHON% skiddle.py --approva
if errorlevel 1 goto :errore

call :fase "RESIDENT ADVISOR"
%DPA_PYTHON% residentadvisor.py
if errorlevel 1 goto :errore
%DPA_PYTHON% residentadvisor.py --approva
if errorlevel 1 goto :errore

call :fase "CONCERTI DA SITI FESTIVAL E PROMOTER"
%DPA_PYTHON% fonti_europee.py --concert-only --enqueue-events --max-pages 30 --delay 1.5 --output "..\assets\data\events_concerti_europei_pending.json"
if errorlevel 1 goto :errore
%DPA_PYTHON% "coordinate eventi\ingest.py" --approva-prefisso "europa:"
if errorlevel 1 goto :errore

call :fase "ARCHIVIO EVENTI PASSATI"
%DPA_PYTHON% "coordinate eventi\ingest.py" --archivia-passati
if errorlevel 1 goto :errore

call :fase "COORDINATE LOCALI"
%DPA_PYTHON% "coordinate eventi\coordinate_eventi.py" --apply
if errorlevel 1 goto :errore
%DPA_PYTHON% "coordinate eventi\geocodifica_coordinate.py" --apply --limit 100 --delay 2.5 --retry-incerti-giorni 7
if errorlevel 1 goto :errore

call :fase "PAGINE LOCALI E SEO"
%DPA_PYTHON% genera_pagine_locali.py
if errorlevel 1 goto :errore
%DPA_PYTHON% genera_seo.py
if errorlevel 1 goto :errore

set "DPA_DATA_DONE=1"
if not "%DPA_CAN_PUBLISH%"=="1" goto :solo_locale

:pubblica_eventi
call :fase "PUBBLICAZIONE GITHUB"
REM Non usare "git add -A": includerebbe Oasis, store o altri lavori in corso.
REM Questi sono gli unici output pubblici generati dall'aggiornamento eventi.
git -C "%~dp0.." add -A -- "assets/data/events.json" "assets/data/events_archivio.json" "assets/data/seo_local_manifest.json" "assets/js/events-data.js" "robots.txt" "sitemap.xml" "ca" "de" "en" "es" "fr" "it"
if errorlevel 1 goto :errore_pubblicazione
git -C "%~dp0.." diff --cached --quiet
if errorlevel 1 (
    git -C "%~dp0.." commit -m "Aggiornamento settimanale eventi (auto)"
    if errorlevel 1 goto :errore_pubblicazione
) else (
    echo [%date% %time%] Nessuna modifica nuova da committare.
)
git -C "%~dp0.." push
if errorlevel 1 goto :errore_pubblicazione

echo [%date% %time%] FATTO.

REM Se lanciato a mano (doppio click) mostra la pausa; se schedulato (arg "auto") no.
if not "%1"=="auto" pause
exit /b 0

:solo_locale
echo.
echo [%date% %time%] DATI AGGIORNATI CORRETTAMENTE IN LOCALE.
echo Pubblicazione GitHub saltata per proteggere le modifiche gia presenti.
echo Il dettaglio e in: "%DPA_LOG%"
>>"%DPA_LOG%" echo [%date% %time%] FATTO IN LOCALE - push saltato.
if not "%1"=="auto" pause
exit /b 0

:errore_pubblicazione
set "DPA_EXIT=%errorlevel%"
echo.
echo [%date% %time%] DATI AGGIORNATI, MA PUBBLICAZIONE GITHUB FALLITA.
echo Nulla e andato perso: si puo riprovare soltanto il push.
echo Il dettaglio e in: "%DPA_LOG%"
>>"%DPA_LOG%" echo [%date% %time%] DATI OK - PUBBLICAZIONE FALLITA (codice %DPA_EXIT%).
if not "%1"=="auto" pause
exit /b 2

:errore
set "DPA_EXIT=%errorlevel%"
echo.
echo [%date% %time%] ERRORE: aggiornamento interrotto. Nessun push successivo verra eseguito.
echo Fase fallita: %DPA_STEP%
echo Log: "%DPA_LOG%"
echo Puoi rilanciare lo stesso file: backup e controlli duplicati proteggono i dati.
>>"%DPA_LOG%" echo [%date% %time%] ERRORE nella fase: %DPA_STEP% (codice %DPA_EXIT%).
if not "%1"=="auto" pause
exit /b 1

:fase
set "DPA_STEP=%~1"
echo [%date% %time%] --- %~1 ---
>>"%DPA_LOG%" echo [%date% %time%] --- %~1 ---
exit /b 0
