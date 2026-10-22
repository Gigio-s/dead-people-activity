# Mercatino — stato al 20 ottobre 2026

Pannello attivo: https://ramacciato-mercatino.ramacciatoluca.workers.dev/market
Accesso Cloudflare riservato a ramacciatoluca@gmail.com, sessione 24 ore.

Online: registro market_events e trigger applicati dopo backup; 101 prodotti centrali. I 43 mancanti sono stati aggiunti con le destinazioni e lo stato di pubblicazione del gestionale, senza sovrascrivere le quantità esistenti.
Servizi pubblicati: dpa-checkout (worker.js, versione 3bac22a4-d74c-41e0-a564-3dfa0e6e7986), ramacciato-sconti (versione 4a5d175e-c197-4882-8e14-2a225e43f662), ramacciato-mercatino (versione faab29a2-f0de-4a9c-9c56-507f01aa225b).
Il servizio DPA usa worker.js, NON la variante dpa-worker.js. RV usa il proprio worker/worker.js e inventory.js, preservando spedizioni e sconti.

## Uso
Cercare nome o ID, inserire il prezzo incassato, premere Vendi una copia e confermare. Ultime vendite permette Annulla vendita. Serve Internet. Non registrare nuovamente la stessa vendita con Vendi sul PC.
Riavviare il gestionale: ricezione automatica abilitata, all'avvio e ogni 60 secondi. Feed autenticato verificato, nessuna vendita reale effettuata per prova.
Il feed importa solo vendite/annullamenti mercatino, non gli ordini PayPal. Le quantità centrali esistenti sono protette dalla sincronizzazione del PC; rettifiche e rifornimenti richiedono un flusso dedicato.

## File per le altre AI
DPA modificati: worker/worker.js, worker/dpa-worker.js, assets/js/store.js.
DPA nuovi: worker/market.js, market-ui.js, market-entry.js, market-schema.sql, test-market.mjs, README_MERCATINO.md.
RV modificati: shop.html, worker/worker.js. Nuovi: market-stock.js, worker/inventory.js, worker/test-inventory.mjs, NOTA_MERCATINO.md.
Gestionale: app.py, inventory_client.py, market_client.py, test_market.py, README.md; impostazione market_enabled=1.

## Pubblicazione vetrine
RV: shop.html e market-stock.js pubblicati su GitHub tramite API (commit finale 4916c5165624b36078dcd8b1f5c256c3c3509869). Il commit locale be70565 contiene gli stessi file ma ha una storia diversa: prima di futuri push riconciliare con origin/main, senza force push.
DPA: assets/js/store.js con MARKET_STOCK_ENABLED=true è pronto localmente ma NON pubblicato: GitHub HTTP 403. Pubblicare soltanto questo file per abilitare refresh ogni 30 secondi e blocco del fallback statico. Il negozio live già legge D1 al caricamento; i checkout condivisi già controllano le scorte. Non includere cataloghi/foto/altre modifiche locali nel commit.

## Verifiche
13 test Worker RV/DPA/mercatino superati con SQLite e pagamenti simulati. 38 test Python passati nella preparazione. Feed autenticato PC verificato online: risposta corretta, ricezione abilitata. Endpoint pubblici: 92 prodotti RV, 86 DPA. Login del pannello raggiungibile; sessione privata e vendita completa dal telefono ancora da verificare con l'utente, senza vendite fittizie su prodotti reali.
Backup privato esterno ai repository dei siti: cartella di lavoro Codex work/private-backup/inventory-before-market-20261020.sql. Non pubblicarlo.
