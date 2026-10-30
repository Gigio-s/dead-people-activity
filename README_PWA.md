# DPA come app installabile

## Componenti

- `manifest.webmanifest`: nome, icone, colori, schermata iniziale e scorciatoie.
- `service-worker.js`: cache dell'interfaccia e ultimo catalogo Drunk Mode disponibile.
- `offline.html`: fallback quando una pagina non e disponibile senza connessione.
- `assets/js/pwa.js`: installazione Android/desktop, istruzioni iPhone e metriche aggregate.
- `assets/img/pwa/`: icone Android, maskable e Apple.
- `scripts/genera_icone_pwa.py`: rigenera le icone partendo dal marchio DPA originale.

## Comportamento cache

- HTML: network first, poi copia salvata o pagina offline.
- `drunk-events.json`: network first, poi ultimo catalogo salvato.
- CSS, JavaScript e immagini: stale while revalidate.
- Checkout, richieste POST e risorse esterne non vengono intercettati.

Quando cambiano in modo incompatibile file o strategie di cache, aumentare il suffisso delle costanti cache in `service-worker.js`.

## Metriche

Il client invia soltanto nome dell'evento tecnico e piattaforma a:

`https://dpa-checkout.ramacciatoluca.workers.dev/pwa-metric`

Non invia posizione, citta, genere scelto, account o identificatori del dispositivo.

Eventi registrati:

- disponibilita del prompt;
- clic sul pulsante installa;
- scelta accettata o rifiutata;
- evento di installazione Chromium;
- apertura delle istruzioni iPhone;
- primo avvio standalone;
- avvii PWA;
- ricerche Drunk Mode.

Su iPhone non esiste una conferma universale dell'installazione. `ios_first_standalone_launch` indica che la web app e stata avviata almeno una volta dalla schermata Home.

Il Worker crea automaticamente la tabella D1 `pwa_metrics` al primo evento. Le statistiche degli ultimi 90 giorni sono disponibili, con autenticazione amministrativa, tramite:

`GET /admin/pwa-metrics`

Usare l'header `Authorization: Bearer ...`. Non inserire il token in documentazione, codice pubblico o screenshot.

