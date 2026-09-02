# Aggiornamento Store condiviso per Claude — 24 agosto 2026

Claude deve continuare a lavorare nella cartella che usa abitualmente, senza
modificare gli originali e senza inserire `- chatgpt` nei percorsi del codice.

## DPA

- `store.html` non e piu soltanto una pagina Coming Soon: ospita il catalogo
  musicale condiviso con Ramacciato Vintage.
- `assets/js/store.js` prova il catalogo centrale del Worker e dopo 2,5 secondi
  usa il fallback locale `assets/data/store/catalogo-musica.json`.
- La vetrina mostra prezzo, disponibilita, ricerca e collegamento diretto al
  prodotto su Ramacciato Vintage.
- Il link aggiunge `source=dpa`, che viene conservato fino alla creazione
  dell'ordine PayPal.
- Sono state aggiunte tutte le stringhe in italiano, inglese, spagnolo,
  catalano, tedesco e francese.
- Sono stati aggiunti gli stili responsive in `assets/css/style.css`.
- Il catalogo fallback contiene attualmente 418 prodotti musicali pubblici.

## Ramacciato Vintage

La copia RV contiene il gestionale esteso, il nuovo client inventario e la
predisposizione Worker/D1. Il dettaglio completo si trova nel file
`AGGIORNAMENTO_PER_CLAUDE_2026-08-24.md` della copia RV.

## Importante

Il backend centrale non e ancora attivo: non sono stati creati D1, binding,
segreti o deploy. Il sito DPA funziona comunque usando il JSON locale. Prima di
attivare il backend bisogna usare PayPal sandbox e seguire `worker/README.md`
nella copia RV.

## Verifiche completate

- 418 prodotti caricati;
- ricerca e fallback verificati;
- traduzioni JSON valide;
- JavaScript valido;
- controllo visuale desktop e mobile 390x844 superato.
