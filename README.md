# Dead People Activity

Piattaforma indipendente dedicata alla cultura underground europea: archivio vivente,
mappa eventi, magazine, community. Estetica punk / fanzine / DIY (nero, rosso, bianco).

Sito statico (HTML/CSS/JS) con una piccola pipeline Python per importare gli eventi.

## Struttura

```
index.html            Home
mappa.html            Mappa interattiva eventi (Leaflet)
articoli.html         Articoli e recensioni
archivio.html         Archivio LIVE
buried.html           Archivio BURIED (realtà scomparse)
eventi.html           Calendario
diy.html              Guide DIY
collaboratori.html    Rete collaboratori
apparire.html         Candidature / invii community
contatti.html         Contatti
assets/css/           Stile (Permanent Marker + Special Elite)
assets/js/            main.js, mappa.js, events-data.js (fallback locale)
assets/data/          events.json  <-- FONTE UNICA degli eventi
scripts/ingest.py     Pipeline: raccoglie eventi -> normalizza -> coda "in attesa"
```

## Dati eventi

- **`assets/data/events.json`** è la fonte canonica letta dalla mappa.
- **`assets/js/events-data.js`** è solo una copia-specchio di riserva (apertura locale `file://`).
  Modificare sempre `events.json`, poi rispecchiare qui.

## Pipeline eventi (scripts/ingest.py)

Raccoglie da piu' fonti (modulo community, Ticketmaster, ...), le uniforma allo schema
di `events.json`, assegna le coordinate, toglie i doppioni e mette tutto in coda
`events_pending.json` con `approvazione: "in_attesa"`. **Non pubblica nulla in automatico.**

```
python scripts/ingest.py            # raccoglie -> coda in attesa
python scripts/ingest.py --show     # mostra la coda
python scripts/ingest.py --approva <ID>   # pubblica un evento in events.json
```

Per attivare Ticketmaster: chiave gratuita su developer.ticketmaster.com, poi
`TM_API_KEY=la_tua_chiave python scripts/ingest.py`.

## Regole non negoziabili (identità del progetto)

- Non cambiare lo stile grafico né i font (Permanent Marker / Special Elite).
- Conservare la distinzione **[LIVE]** / **[BURIED]**.
- Nessun contenuto utente pubblicato in automatico: tutto passa da moderazione.
- Contenuti sponsorizzati sempre dichiarati.

## Stato

Work in progress. Fatte: Home ampliata, mappa, pipeline eventi (scheletro).
Da fare: pagine artisti / playlist / shop / community, fonti eventi aggiuntive.
