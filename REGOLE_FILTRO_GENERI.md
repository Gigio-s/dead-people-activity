# Dead People Activity — Regole del filtro generi
_Ultimo aggiornamento: agosto 2026_

Queste regole decidono **quali eventi entrano sulla mappa** e quali vengono scartati.
Valgono per **tutte le fonti**: Ticketmaster, Dice, Skiddle e ogni fonte futura.

Il filtro è centralizzato nel codice, in `scripts/ingest.py`:
- lista dei generi ammessi → costante `GENERI_AMMESSI`
- logica di decisione → funzione `genere_ammesso()`

Poiché è condiviso, **basta modificarlo lì una volta** e cambia il comportamento di tutte le fonti.

---

## 1. Cosa teniamo — tre famiglie

Teniamo solo eventi che appartengono a una di queste tre famiglie (con **tutti** i loro sottogeneri):

- **ROCK (in senso ampio)** — rock, alternative, indie, garage, grunge, stoner, psych/psychedelic, shoegaze, post-punk, new wave, no wave, surf, math rock, krautrock, goth/gothic/darkwave/deathrock, britpop; **punk** e derivati (hardcore, post-hardcore, emo, screamo, crust, d-beat, oi, ska, powerviolence); **metal** e derivati (metalcore, deathcore, grindcore, thrash, death, black metal, doom, sludge, nu metal, hard rock).
- **RAP / HIP-HOP** — rap, hip-hop, trap, drill, grime, boom bap.
- **TECHNO / ELETTRONICA DA CLUB** — techno, electronic/electronica, electro, house, acid, minimal, idm, breakbeat/breaks, drum and bass/dnb, dubstep, trance, rave, gabber, hardgroove, hardstyle, hard dance, hard house, tech house, bass, uk garage, jungle, bassline, edm.
- Affini underground tenuti comunque: industrial, noise, ebm.

Tutto il resto è **escluso**: pop, disco, funk, soul, jazz, blues, reggae, dancehall, afrobeat, amapiano, country/americana, folk, latin, world music, k-pop, swing, "cheesy dance", "themed", acoustic (da solo), ecc.

---

## 2. Come funziona la corrispondenza

- Il controllo è per **sottostringa**: se **anche una sola** delle parole ammesse compare nel/i genere/i dell'evento, l'evento passa.
  Esempi: `Pop Rock` passa (contiene "rock"); `Indie Pop` passa (contiene "indie"); `Deep House` passa (contiene "house").
- Un evento **senza alcun genere** viene **scartato** (per evitare di far entrare pop/altro non etichettato) — salvo l'eccezione festival (punto 4).

---

## 3. Tribute band e cover band

- **Si tengono SE sono del genere giusto.** Una tribute band **rock/metal/punk** resta; una tribute **pop** no.
- Non esiste una blocklist che escluda i tributi a priori: decide solo il genere.
  Esempio: `Iron Maiden Tribute [Rock, Metal]` → **tenuto**. `ABBA Tribute [Pop]` → **scartato**.

---

## 4. Festival

- Un **festival** si tiene **anche se i tag generi mancano o non combaciano**, purché il **nome** contenga uno dei generi ammessi.
  Esempi: `Techno Open Air Festival` (senza tag) → **tenuto**; `Punk Rock Fest` (taggato solo "Pop") → **tenuto**; `Summer Pop Festival` → **scartato**.
- Riconosciamo il festival dal campo `tipo` (contiene "fest").

---

## 5. Caso limite noto

- Eventi etichettati **`Alternative Pop`** passano il filtro, perché contengono la parola "alternative" (genere rock ammesso).
  È il rovescio del match ampio. Scelta attuale: **lasciarlo così** per non perdere alternative rock legittimo.
  Se in futuro dà fastidio, si può gestire con una regola più fine.

---

## 6. Dove si modifica

File: `scripts/ingest.py`

- Per **aggiungere/togliere un genere** → modifica la lista `GENERI_AMMESSI`.
- Per **cambiare la logica** (es. tributi, festival) → modifica la funzione `genere_ammesso()`.

Dopo una modifica, per **riapplicare il filtro alla coda già raccolta**:

```
python ingest.py --filtra-coda
```

(Gli eventi inviati dalla community e da Dice restano comunque; vengono rifiltrate le fonti "firehose" come Ticketmaster e Skiddle.)

---

## 7. Stato verificato (agosto 2026)

- Applicato a Ticketmaster, Dice e Skiddle: **sì** (filtro condiviso).
- Eventi già pubblicati in `events.json` (7805): controllati, **0 da rimuovere** — già conformi.
- Coda Skiddle: filtrata correttamente; verrà ricostruita fresca dopo l'ok commerciale di Skiddle.
