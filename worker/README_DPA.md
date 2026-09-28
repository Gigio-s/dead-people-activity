# Checkout DPA — preparazione e attivazione

Questa cartella contiene una **copia adattata** del Worker PayPal già usato da
Ramacciato Vintage. Non contiene credenziali PayPal né token amministrativi.
DPA usa lo stesso flusso di RV: il Worker rilegge prezzi e disponibilità dal
catalogo JSON pubblicato prima di creare l'ordine PayPal.

## Cosa è stato preparato

- `store.html`: scheda prodotto in sovraimpressione e carrello locale.
- `checkout.html`: indirizzo, riepilogo, preventivo e pulsanti PayPal.
- `worker.js`: mantiene il flusso RV e aggiunge il canale DPA. Il browser non
  decide l'importo: per DPA il prezzo viene riletto da
  `assets/data/store/catalogo-musica.json` online.

## Passaggi necessari su Cloudflare prima della vendita

1. Fare un backup del codice attuale del Worker `ramacciato-sconti`.
2. Conservare `PAYPAL_CLIENT_ID` e `PAYPAL_SECRET` già configurati nei segreti
   Cloudflare. Non vanno inseriti nei file del sito.
3. Caricare il codice aggiornato di `worker.js` sullo stesso Worker. Le rotte RV
   rimangono compatibili; vengono aggiunti il dominio e il catalogo DPA.
4. Pubblicare prima `assets/data/store/catalogo-musica.json` e le copertine DPA,
   affinché il Worker possa rileggere prezzi e disponibilità dal sito.
5. Verificare `GET /products?channel=dpa&category=musica`, quindi provare un
   ordine DPA completo.

La pagina checkout non mostra PayPal se il Worker o i segreti PayPal non sono
disponibili. Pubblicare i soli file HTML/JS **non basta**: serve anche il Worker
aggiornato con il dominio DPA autorizzato.
I controlli locali del Worker si eseguono con `node --test worker/test-worker.mjs`.
Il collaudo sandbox con un vero ordine resta obbligatorio prima del live.

## Tariffe confermate

La copia usa le tariffe RV confermate: Italia €5,90, altri Paesi europei
€12,90, spedizione gratuita da €50. Il ritiro locale non è offerto su DPA.

## Inventario

Come nel checkout RV attuale, PayPal non modifica automaticamente il file JSON
pubblicato. Dopo una vendita bisogna registrare l'ordine nel gestionale e
pubblicare il catalogo aggiornato. Il supporto D1 presente nel Worker resta
facoltativo per una futura sincronizzazione automatica, ma non è necessario
per avviare DPA con lo stesso sistema di RV.

## File da copiare

Per il sito DPA: `store.html`, `checkout.html`, `assets/js/store.js`,
`assets/js/checkout.js`, `assets/js/i18n.js`, `assets/css/style.css` e i sei
JSON in `assets/i18n`. La cartella `worker` serve per il deploy Cloudflare:
non viene eseguita da GitHub Pages.
