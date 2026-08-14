# THE WALL — Guida rapida (backend Supabase)

La pagina `the-wall.html` funziona **subito in modalità demo** (post-it di esempio, invii disattivati).
Per farla diventare un muro vero dove gli utenti postano davvero — **con moderazione** — collega Supabase. Bastano ~15 minuti, una volta sola.

## 1. Crea il progetto (gratis)
1. Vai su https://supabase.com → **Start your project** → accedi (GitHub va bene).
2. **New project**. Dai un nome (es. `dead-people-wall`), scegli una password DB (salvala), regione Europa (Frankfurt).
3. Aspetta ~2 minuti che il progetto si crei.

## 2. Crea le tabelle
1. Menu a sinistra → **SQL Editor** → **New query**.
2. Apri il file `scripts/supabase_wall.sql`, copia tutto, incolla nell'editor.
3. **Run**. Deve dire *Success*. Ha creato `wall_posts` e `wall_comments` con la moderazione già impostata.

## 3. Prendi le due chiavi
1. Menu → **Project Settings** (icona ingranaggio) → **API**.
2. Copiati:
   - **Project URL** (tipo `https://xxxx.supabase.co`)
   - **anon public** key (una stringa lunga — è pubblica, può stare nel sito, è sicura).

## 4. Incolla le chiavi nel sito
Apri `assets/js/the-wall.js`, in cima trovi:

```js
var CONFIG = {
    SUPABASE_URL: "INCOLLA_QUI_PROJECT_URL",
    SUPABASE_ANON_KEY: "INCOLLA_QUI_ANON_KEY"
};
```

Sostituisci i due valori. Salva. Fatto: il muro è vivo.

## 5. Moderare (approvare i post)
Niente viene pubblicato in automatico. Per far comparire un post-it o un commento:
- Supabase → **Table Editor** → `wall_posts` → trova la riga nuova → metti la spunta su **approved** → salva.
- Stesso per `wall_comments`.

Oppure da **SQL Editor**:
```sql
-- vedere cosa è in attesa
select id, created_at, author, genre, body from wall_posts where approved = false order by created_at;
-- approvare
update wall_posts set approved = true where id = 'INCOLLA_ID';
```

## Note
- La **anon key è pubblica per natura** (i siti statici Supabase funzionano così). Le regole di sicurezza (RLS) fanno sì che dal browser si possa solo *inserire in attesa* e *leggere gli approvati* — non approvare, non cancellare.
- Immagini post-it: vanno in `assets/img/wall/` con i nomi `postit-rock.png`, `postit-rap.png`, `postit-techno.png`, e lo sfondo `wall.png`. Se mancano, i post-it usano comunque il colore del genere.
- Piano gratuito Supabase: ampiamente sufficiente per iniziare. Se il progetto resta inattivo a lungo va in pausa: basta riaprirlo.
