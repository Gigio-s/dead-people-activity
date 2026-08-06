# Dead People Activity — Responsive & Traduzione EN
_Aggiornato: agosto 2026 · modificati solo `assets/css/style.css` e `assets/js/main.js`_

## 1. Mobile friendly (responsive)
Aggiunte regole per telefoni e schermi piccoli, **senza toccare l'identità grafica**
(nero/rosso/bianco, font Permanent Marker + Special Elite, bordi tratteggiati).

- Nuovi breakpoint: **768px**, **600px**, **380px** (oltre a quelli già presenti a 900px).
- `overflow-x: hidden` + `overflow-wrap` sui titoli → niente scroll orizzontale da titoli larghi/ombre/rotazioni.
- `img, iframe, video { max-width:100% }` e campi form che non escono dallo schermo.
- Tipografia e spaziature scalate su mobile (hero, titoli, mappa, statistiche).
- Su telefono: pulsanti a piena larghezza, card senza rotazione (evita bordi tagliati), barra strumenti mappa in colonna, viste elenco/calendario a 1 colonna, chatbot a larghezza schermo.

Da provare: apri il sito e restringi la finestra, oppure DevTools (F12) → icona dispositivo mobile.

## 2. Traduzione Italiano / Inglese
Sistema **i18n** in `main.js`: un selettore **EN / IT** compare in automatico nell'header
di **tutte le pagine**. La scelta è ricordata (localStorage) e vale navigando tra le pagine.

Come funziona: traduce per **corrispondenza esatta del testo** usando il dizionario
`I18N_PHRASES` dentro `main.js`. Non modifica l'HTML: sostituisce solo i nodi di testo.
Le frasi non presenti nel dizionario **restano in italiano** (nessuna pagina si rompe).

### Cosa è già tradotto
- **Navigazione e footer** su tutte le pagine (Mappa, Articoli, Contatti, Archivio, Buried, ecc.).
- **Banner cookie** e link legali.
- **Home page: interamente** (hero, manifesto, cosa facciamo, numeri, articoli, mappa, in arrivo, CTA).

### Cosa NON è ancora tradotto
- Il **corpo** delle altre pagine (mappa, articoli, contatti, buried, ecc.): restano in italiano finché non si aggiungono le loro frasi al dizionario.
- Le **card "Eventi in evidenza"** in home: sono generate via JS dopo il caricamento, quindi restano in italiano (etichette come "Acquista biglietti", "GRATIS").

### Come tradurre una nuova pagina (facile)
In `main.js`, dentro `I18N_PHRASES`, aggiungi le frasi della pagina nel formato:

```js
"Testo esatto in italiano": "Exact English text",
```

Importante: il testo italiano deve essere **identico** a quello nella pagina
(stessi accenti, apostrofi e punteggiatura). Fatto questo, la pagina si traduce da sola.

## 3. Nota
Nessun `git push` è stato fatto: le modifiche sono pronte nella cartella locale.
Al prossimo push vanno online (insieme allo scraper Resident Advisor e ai filtri generi).
