# Idee e roadmap DPA

## Presenza territoriale e registro dei locali

Stato: idea approvata, da sviluppare quando ci sara tempo.

- Creare un registro strutturato dei locali per citta, iniziando da Barcellona.
- La base di Barcellona e gia disponibile nei dati DPA: almeno 103 nomi di locali negli eventi correnti e 171 nell'archivio storico, da normalizzare, deduplicare e verificare.
- Incrociare i locali gia presenti con OpenStreetMap e successivamente verificare sito ufficiale, Instagram, Facebook, calendario, indirizzo, coordinate, generi, stato di apertura e priorita.
- Usare Google Maps e Instagram principalmente per verifica e completamento, non per creare manualmente tutta la lista.
- Dividere le fonti in fasce: locali con calendario strutturato, locali con biglietteria o social regolari, piccoli spazi che pubblicano soprattutto locandine.
- Ogni locale potra avere una scheda DPA con prossimi eventi, mappa e collegamenti al sito e ai profili social ufficiali, incluso Instagram.
- In futuro il sistema dovra essere replicabile citta per citta.

## DPA Drunk Version

Stato: concept approvato, da progettare e sviluppare.

Obiettivo: creare una modalita mobile estremamente semplice da utilizzare quando l'utente e ubriaco, stanco o vuole decidere rapidamente dove andare. Non deve essere soltanto una variante grafica, ma un percorso ridotto alle sole decisioni indispensabili.

### Accesso

- Mostrare su mobile, all'apertura del sito, un banner o pulsante molto visibile con una formula come "Sei ubriaco?".
- Mantenere un accesso evidente anche nell'header o nel menu.
- Consentire in qualunque momento il ritorno alla versione normale.
- Valutare se ricordare temporaneamente la scelta sul dispositivo, senza obbligare l'utente a creare un account.

### Flusso essenziale

1. Chiedere: "Dove sei?"
   - Opzione posizione esatta tramite geolocalizzazione del telefono, solo dopo consenso esplicito.
   - Alternativa manuale tramite citta o zona.
2. Chiedere: "Che cosa vuoi sentire?"
   - Mostrare grandi pulsanti basati sulle categorie musicali gia adottate da DPA.
   - Prevedere anche una risposta aperta come "Qualsiasi cosa".
3. Mostrare immediatamente gli eventi compatibili piu vicini, ordinati considerando distanza e orario.
4. Per ogni risultato mostrare soltanto le informazioni indispensabili: evento, locale, distanza, ora, prezzo quando disponibile e pulsante per le indicazioni stradali.

### Principi dell'interfaccia

- Progettazione mobile-first.
- Testi molto grandi, contrasto elevato e pulsanti enormi.
- Una domanda per schermata.
- Pochissimo testo e nessun filtro complesso.
- Nessuna azione importante affidata soltanto a icone ambigue.
- Risultati utilizzabili con una mano e con pochi tocchi.
- Possibile tono ironico coerente con DPA, senza rendere poco chiari posizione, costo e destinazione.

### Relazione con il registro dei locali

- Il registro territoriale dei locali rende la Drunk Version piu utile anche quando non sono presenti eventi completi.
- I risultati principali devono essere eventi verificati contenuti nel database DPA.
- Eventuali locali o discoteche mostrati senza un evento verificato devono essere distinti chiaramente e non presentati come se avessero una serata confermata.
- Le schede dei locali potranno fornire posizione, collegamenti social ufficiali, sito e indicazioni stradali.

### Questioni da definire prima dello sviluppo

- Nome definitivo e testi nelle sei lingue del sito.
- Categorie musicali da mostrare nella modalita semplificata.
- Raggio iniziale di ricerca e comportamento quando non ci sono risultati vicini.
- Peso relativo di distanza, orario di inizio, prezzo e affidabilita della fonte.
- Eventuale filtro "aperto adesso" per locali senza un evento specifico.
- Gestione degli eventi gia iniziati e dell'orario oltre la mezzanotte.
- Informativa e trattamento della geolocalizzazione: usare la posizione solo per la ricerca richiesta e non conservarla inutilmente.

### Sviluppi possibili

- Pulsante "Portami li" collegato all'app di navigazione del telefono.
- Modalita gruppo con generi accettabili per piu persone.
- Risposta rapida "scegli tu".
- Condivisione del risultato con amici.
- Suggerimenti per rientrare in sicurezza e collegamenti a taxi o trasporto pubblico, separati dalle raccomandazioni editoriali.

