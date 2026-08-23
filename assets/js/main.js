/**
 * Dead People Activity - Main Script
 */

document.addEventListener('DOMContentLoaded', () => {

    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    const body = document.querySelector('body');

    // ---- Favicon DPA (il logo disegnato) su tutte le pagine ----
    (function () {
        var href = 'assets/img/dpa%20no%20sfondo.png?v=2';
        document.querySelectorAll("link[rel~='icon']").forEach(function (l) { if (l.parentNode) l.parentNode.removeChild(l); });
        var l = document.createElement('link');
        l.setAttribute('rel', 'icon');
        l.setAttribute('type', 'image/png');
        l.setAttribute('href', href);
        document.head.appendChild(l);
    })();

    // ============================================================
    //  i18n — Italiano (default) / Inglese.
    //  Traduce per corrispondenza ESATTA del testo (nav, footer,
    //  contenuti home). Basta aggiungere le frasi di una pagina qui
    //  sotto per tradurla: quelle non presenti restano in italiano.
    //  Nessuna modifica all'HTML: si sostituiscono solo i nodi di testo.
    // ============================================================
    const I18N_PHRASES = {
        // --- Navigazione / voci comuni (valgono su tutte le pagine) ---
        "Mappa": "Map",
        "Articoli": "Articles",
        "Store": "Store",
        "Contatti": "Contacts",
        "Archivio": "Archive",
        "Buried": "Buried",
        "Collaboratori": "Contributors",
        "Apparire": "Get Featured",
        "Eventi": "Events",
        "Gli eventi vengono aggiornati ogni lunedì tra le 9:00 e le 11:00.": "Events are updated every Monday between 9:00 and 11:00.",
        // --- Filtri mappa ---
        "Dal giorno": "From date",
        "Al giorno": "To date",
        // --- Footer ---
        "Naviga": "Navigate",
        "Seguici": "Follow us",
        "Affiliazioni": "Affiliate Disclosure",
        "Piattaforma media indipendente e archivio radicale delle scene alternative italo-spagnole. Nessun padrone, solo attitudine.":
            "Independent media platform and radical archive of Italy's and Spain's alternative scenes. No masters, just attitude.",
        "© 2026 Dead People Activity. Tutti i diritti riservati. Testi, contenuti e marchio non possono essere copiati o riprodotti senza autorizzazione. Keep it underground.":
            "© 2026 Dead People Activity. All rights reserved. Text, content and trademark may not be copied or reproduced without permission. Keep it underground.",
        // --- Banner cookie (generato via JS, tradotto qui) ---
        "Usiamo cookie tecnici e, con il tuo consenso, cookie di terze parti (mappe e link ai biglietti/affiliati). Dettagli nella":
            "We use technical cookies and, with your consent, third-party cookies (maps and ticket/affiliate links). Details in the",
        "Rifiuta": "Decline",
        "Accetta": "Accept",
        // --- HOME: hero ---
        "Un network musicale europeo per chi la musica la vive dal vivo: artisti e band, ascoltatori curiosi, gente che ai concerti non manca mai. Colleghiamo le scene di tutta Europa e ti mostriamo dove suonare, dove andare stasera e chi vale la pena ascoltare.":
            "A European music network for people who live music in person: artists and bands, curious listeners, people who never miss a gig. We connect scenes across Europe and show you where to play, where to go tonight and who's worth listening to.",
        "Esplora la Mappa": "Explore the Map",
        "Leggi gli Articoli": "Read the Articles",
        // --- HOME: manifesto ---
        "Manifesto": "Manifesto",
        "\"Dead People Activity nasce dal basso: da chi la musica dal vivo la suona, la ascolta, la insegue di locale in locale. Non è una rivista né un'app: è l'inizio di una comunità europea che vuole crescere e diventare grande, un pezzo alla volta e con le proprie mani. Niente padroni, niente algoritmi: solo persone, concerti e scene che si tengono vive a vicenda.\"":
            "\"Dead People Activity starts from the ground up: from the people who play live music, listen to it, chase it from venue to venue. It's not a magazine or an app: it's the start of a European community that wants to grow and get big, one piece at a time and with its own hands. No masters, no algorithms: just people, gigs and scenes that keep each other alive.\"",
        "Questo è solo il primo passo, e c'è posto per chiunque voglia esserci: ragazzi alla prima serata e gente che gira per club da vent'anni, artisti e ascoltatori, chi organizza e chi semplicemente non manca mai. Se ti muove la musica indipendente, questo posto è anche tuo. Il resto lo costruiamo insieme.":
            "This is only the first step, and there's room for anyone who wants in: kids at their first gig and people who've done the club circuit for twenty years, artists and listeners, those who organise and those who simply never miss out. If independent music moves you, this place is yours too. The rest we build together.",
        // --- HOME: sezioni attive ---
        "Cosa trovi qui": "What you'll find here",
        "Tre modi per orientarti nella musica dal vivo europea, scoprire nuove date e partecipare alla scena.":
            "Three ways to navigate European live music, discover new dates and take part in the scene.",
        "CERCA // FILTRA // VAI": "SEARCH // FILTER // GO",
        "01 / Eventi vicino a te": "01 / Events near you",
        "Concerti e DJ set in tutta Europa, raccolti in una mappa e in un elenco aggiornato. Filtra per genere, data e distanza oppure usa “Vicino a me”.":
            "Gigs and DJ sets across Europe, collected in a map and an updated list. Filter by genre, date and distance, or use ‘Near me’.",
        "ESPLORA GLI EVENTI": "EXPLORE EVENTS",
        "PARTI // SCOPRI // RESTA": "TRAVEL // DISCOVER // STAY",
        "02 / Festival in Europa": "02 / Festivals in Europe",
        "Una sezione separata per trovare festival rock, punk, metal, rap, hip-hop, techno ed elettronica, senza confonderli con le singole serate.":
            "A dedicated section for rock, punk, metal, rap, hip-hop, techno and electronic festivals, kept separate from individual shows.",
        "SCOPRI I FESTIVAL": "DISCOVER FESTIVALS",
        "SCRIVI // CERCA // CONNETTI": "POST // SEARCH // CONNECT",
        "03 / The Wall": "03 / The Wall",
        "La bacheca della community: cerca musicisti, proponi una serata, scambia strumenti o segnala un progetto. Ogni messaggio viene moderato.":
            "The community board: find musicians, pitch a show, trade gear or share a project. Every post is moderated.",
        "VAI A THE WALL": "GO TO THE WALL",
        // --- HOME: vecchi testi (compatibilita pagine salvate) ---
        "Cosa Facciamo": "What We Do",
        "01 / La Mappa": "01 / The Map",
        "Una mappa dei concerti in tutta Europa: serate, festival, DJ set e live. Cerchi la tua città e scopri dove andare stasera o nel weekend.":
            "A map of gigs across Europe: club nights, festivals, DJ sets and live shows. Search your city and find where to go tonight or this weekend.",
        "02 / Le Storie": "02 / The Stories",
        "Interviste vere, recensioni oneste e racconti dai club e dagli spazi autogestiti. Le voci di chi la scena la fa, senza filtri e senza marchette.":
            "Real interviews, honest reviews and stories from clubs and DIY spaces. The voices of the people who make the scene — no filters, no sellouts.",
        "03 / La Rete": "03 / The Network",
        "Artisti, ascoltatori e gente dei concerti che si trovano da una città all'altra. Le scene locali smettono di essere isole.":
            "Artists, listeners and gig-goers meeting from one city to the next. Local scenes stop being islands.",
        // --- HOME: numeri ---
        "La Rete in Numeri": "The Network in Numbers",
        "Eventi sulla mappa": "Events on the map",
        "Città": "Cities",
        "Paesi europei": "European countries",
        "Locali": "Venues",
        // --- HOME: ultimi articoli ---
        "Ultimi Articoli": "Latest Articles",
        "EDITORIALE": "EDITORIAL",
        "Rumore dall'asfalto: perché nasce Dead People Activity": "Noise from the asphalt: why Dead People Activity exists",
        "Perché serve una mappa e un archivio per la musica dal vivo che rischia di sparire.":
            "Why we need a map and an archive for live music at risk of vanishing.",
        "GUIDA DIY": "DIY GUIDE",
        "La tua prima serata autogestita: guida pratica": "Your first DIY gig: a practical guide",
        "Spazio, budget, line-up, promozione e cassa: come organizzare un concerto dal niente.":
            "Space, budget, line-up, promotion and cash: how to put on a gig from nothing.",
        "Autoprodurre musica: cassette, vinile e CD senza svenarsi": "Self-releasing music: tapes, vinyl and CDs without going broke",
        "Quale supporto scegliere, quanto costa, la grafica DIY e dove vendere le tue copie.":
            "Which format to choose, what it costs, DIY artwork and where to sell your copies.",
        "LEGGI →": "READ →",
        // --- HOME: mappa del rumore ---
        "La Mappa del Rumore": "The Map of Noise",
        "La rete della musica dal vivo su una mappa. Concerti, serate, festival e DJ set in tutta Europa: scegli la tua città e scopri chi suona stasera o dove andare nel weekend.":
            "The live-music network on a map. Gigs, club nights, festivals and DJ sets across Europe: pick your city and find who's playing tonight or where to go this weekend.",
        "Apri la mappa interattiva →": "Open the interactive map →",
        // --- HOME: eventi in evidenza ---
        "Eventi in Evidenza": "Featured Events",
        "Prossime date dalla rete. Aggiornate dall'archivio eventi.": "Upcoming dates from the network. Updated from the events archive.",
        "Tutti gli eventi sulla mappa": "All events on the map",
        // --- HOME: in arrivo ---
        "In Arrivo": "Coming Soon",
        "La piattaforma cresce a fasi. Queste sezioni stanno per arrivare. Per ora esplora la Mappa degli eventi e leggi gli Articoli.":
            "The platform grows in phases. These sections are on the way. For now, explore the events Map and read the Articles.",
        "Archivio & BURIED": "Archive & BURIED",
        "Schede di artisti, band e realtà scomparse da preservare.": "Profiles of artists, bands and vanished scenes worth preserving.",
        "Artisti & Emergenti": "Artists & Emerging",
        "Database e vetrina degli artisti della scena.": "A database and showcase of the scene's artists.",
        "Playlist": "Playlist",
        "Selezione settimanale su Spotify.": "Weekly selection on Spotify.",
        "Shop": "Shop",
        "Autoproduzioni, fanzine, vinili, cassette.": "Self-releases, fanzines, vinyl, tapes.",
        "Community": "Community",
        "Percorsi per artisti e ascoltatori.": "Paths for artists and listeners.",
        "Newsletter": "Newsletter",
        "Concerti nella tua zona, ogni settimana.": "Gigs in your area, every week.",
        "Scopri cosa bolle in pentola": "See what's cooking",
        // --- HOME: CTA finale ---
        "Fai parte del rumore o vuoi salvarlo dall'oblio?": "Part of the noise, or want to save it from oblivion?",
        "Sei un artista, un collettivo, gestisci uno spazio o possiedi materiale d'archivio raro?":
            "Are you an artist or a collective, do you run a space, or hold rare archive material?",
        "Scopri di più": "Learn more",
        // --- STORE ---
        "Merchandise e musica indipendente, direttamente dalla scena.": "Independent merchandise and music, straight from the scene.",
        "Stiamo preparando uno spazio per magliette, felpe, stampe, vinili, cassette, fanzine e autoproduzioni selezionate dalla rete Dead People Activity.":
            "We are building a space for T-shirts, hoodies, prints, vinyl, tapes, fanzines and self-releases selected by the Dead People Activity network.",
        "Cosa troverai": "What you'll find",
        "Merchandise": "Merchandise",
        "Magliette, felpe, patch e stampe Dead People Activity.": "Dead People Activity T-shirts, hoodies, patches and prints.",
        "Musica": "Music",
        "Vinili, cassette e pubblicazioni indipendenti.": "Vinyl, tapes and independent releases.",
        "Fanzine & DIY": "Fanzines & DIY",
        "Edizioni limitate, poster e materiale dalle scene europee.": "Limited editions, posters and material from European scenes.",
        "Accessori": "Accessories",
        "Oggetti e piccole produzioni pensate per chi vive la musica dal vivo.": "Objects and small productions made for people who live music in person.",
        "Lo Store non è ancora aperto. Nessun prodotto è attualmente in vendita.": "The Store is not open yet. No products are currently for sale."
    };

    const getLang = () => window.DPA_I18N ? window.DPA_I18N.getLanguage() : 'it';
    const setLang = (language) => window.DPA_I18N ? window.DPA_I18N.setLanguage(language) : Promise.resolve();
    const applyLang = (language) => setLang(language);

    // Assistente eventi globale. Sulla mappa viene gestito da mappa.js;
    // nelle altre pagine apre la mappa con genere e paese gia selezionati.
    function injectGlobalChatbot() {
        if (document.getElementById('chatbotFab')) return;

        const fab = document.createElement('button');
        fab.type = 'button';
        fab.className = 'chatbot-fab';
        fab.id = 'chatbotFab';
        fab.setAttribute('aria-label', 'Assistente eventi');
        fab.setAttribute('aria-expanded', 'false');
        fab.textContent = '?!';

        const panel = document.createElement('div');
        panel.className = 'chatbot-panel';
        panel.id = 'chatbotPanel';
        panel.setAttribute('aria-hidden', 'true');
        panel.innerHTML =
            '<div class="chatbot-head"><span>Trova il tuo evento</span>' +
            '<button type="button" class="chatbot-close" id="chatbotClose" aria-label="Chiudi assistente">&times;</button></div>' +
            '<div class="chatbot-body" id="chatbotBody"></div>';
        document.body.appendChild(fab);
        document.body.appendChild(panel);

        let choice = { genre: '', country: '' };
        let countriesPromise = null;
        const bodyEl = panel.querySelector('#chatbotBody');
        const escChat = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
        const genreLabel = value => ({
            rock: 'Rock / Punk / Metal / Indie',
            rap: 'Rap / Hip-Hop',
            electronic: 'Techno / Elettronica'
        })[value] || 'Qualsiasi genere';

        function loadCountries() {
            if (countriesPromise) return countriesPromise;
            countriesPromise = fetch('assets/data/events.json')
                .then(response => { if (!response.ok) throw new Error('events'); return response.json(); })
                .then(events => {
                    const seen = new Set();
                    return (Array.isArray(events) ? events : []).map(event => event.paese)
                        .filter(country => country && !seen.has(country) && seen.add(country))
                        .sort((a, b) => String(a).localeCompare(String(b)));
                })
                .catch(() => []);
            return countriesPromise;
        }

        function renderGenre() {
            bodyEl.innerHTML = '<p class="bot-msg">Che musica cerchi?</p><div class="bot-opts">' +
                ['rock', 'rap', 'electronic'].map(value =>
                    '<button type="button" class="bot-opt" data-genre="' + value + '">' + genreLabel(value) + '</button>'
                ).join('') + '<button type="button" class="bot-opt" data-genre="">Qualsiasi</button></div>';
            bodyEl.querySelectorAll('[data-genre]').forEach(button => button.addEventListener('click', () => {
                choice.genre = button.getAttribute('data-genre') || '';
                renderCountry();
            }));
            loadCountries();
        }

        function renderCountry() {
            bodyEl.innerHTML = '<p class="bot-msg">Carico i paesi con eventi...</p>';
            loadCountries().then(list => {
                if (!list.length) {
                    bodyEl.innerHTML = '<p class="bot-msg">Non riesco a caricare i paesi. Puoi comunque aprire tutti gli eventi.</p>' +
                        '<button type="button" class="bot-opt" data-country="">Apri la mappa</button>';
                } else {
                    bodyEl.innerHTML = '<p class="bot-msg">In che paese?</p><div class="bot-opts bot-country-opts">' +
                        list.map(country => '<button type="button" class="bot-opt" data-country="' + escChat(country) + '">' + escChat(country) + '</button>').join('') +
                        '<button type="button" class="bot-opt" data-country="">Ovunque</button></div>';
                }
                bodyEl.querySelectorAll('[data-country]').forEach(button => button.addEventListener('click', () => {
                    choice.country = button.getAttribute('data-country') || '';
                    const params = new URLSearchParams();
                    if (choice.genre) params.set('genere', choice.genre);
                    if (choice.country) params.set('paese', choice.country);
                    window.location.href = 'mappa.html' + (params.toString() ? '?' + params.toString() : '');
                }));
            });
        }

        function setOpen(open) {
            panel.classList.toggle('open', open);
            panel.setAttribute('aria-hidden', open ? 'false' : 'true');
            fab.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open) renderGenre();
        }
        fab.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
        panel.querySelector('#chatbotClose').addEventListener('click', () => setOpen(false));
        document.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
    }
    const injectLangToggle = () => {};

    // Chiude tutte le tendine aperte
    const closeAllDropdowns = () => {
        document.querySelectorAll('.nav-item.has-dropdown.open').forEach(item => {
            item.classList.remove('open');
            const t = item.querySelector('.dropdown-toggle');
            if (t) t.setAttribute('aria-expanded', 'false');
        });
    };

    // Chiude completamente il menu mobile
    const closeMenu = () => {
        if (hamburger) hamburger.classList.remove('active');
        if (navMenu) navMenu.classList.remove('active');
        closeAllDropdowns();
        body.style.overflow = '';
    };

    // Hamburger: apre/chiude il pannello mobile
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            const willOpen = !navMenu.classList.contains('active');
            hamburger.classList.toggle('active', willOpen);
            navMenu.classList.toggle('active', willOpen);
            body.style.overflow = willOpen ? 'hidden' : '';
            if (!willOpen) closeAllDropdowns();
        });
    }

    // Tendine: il tap sul toggle apre/chiude il sottomenu (indispensabile su mobile)
    document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            const item = toggle.closest('.has-dropdown');
            const wasOpen = item.classList.contains('open');
            closeAllDropdowns();            // richiude le altre
            if (!wasOpen) {
                item.classList.add('open');
                toggle.setAttribute('aria-expanded', 'true');
            }
        });
    });

    // Un click su un vero link di navigazione (non i toggle) chiude tutto
    document.querySelectorAll('.nav-link:not(.dropdown-toggle)').forEach(link => {
        link.addEventListener('click', closeMenu);
    });

    // Click fuori dal menu: chiude le tendine aperte
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.nav-menu') && !e.target.closest('.hamburger')) {
            closeAllDropdowns();
        }
    });

    // ESC chiude le tendine
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllDropdowns();
    });

    // ---- Header auto-nascondi (scroll giu') + riappari ----
    const header = document.querySelector('.header');
    if (header) {
        // Sulla mappa NON riappare col movimento del cursore (spuntava sopra la mappa).
        const isMapPage = document.body.classList.contains('page-map');
        let lastY = window.scrollY;
        const showHeader = () => header.classList.remove('header--hidden');
        const hideHeader = () => {
            // Non nascondere se il menu mobile e' aperto o se il cursore e' sopra l'header
            if (navMenu && navMenu.classList.contains('active')) return;
            if (header.matches(':hover')) return;
            header.classList.add('header--hidden');
        };

        window.addEventListener('scroll', () => {
            const y = window.scrollY;
            if (y < 80) showHeader();                 // vicino alla cima: sempre visibile
            else if (y > lastY + 4) hideHeader();     // scroll verso il basso: scompare
            else if (y < lastY - 4) showHeader();     // scroll verso l'alto: riappare
            lastY = y;
        }, { passive: true });

        // Riappare portando il cursore in alto: solo fuori dalla mappa
        if (!isMapPage) {
            document.addEventListener('mousemove', (e) => {
                if (e.clientY < 60) showHeader();
                else if (window.scrollY > 80 && !header.matches(':hover')) hideHeader();
            });
        }
        header.addEventListener('mouseenter', showHeader);
    }

    // Gestione invio Form "Apparire" (Simulazione Client-Side - NON collegato a un backend)
    const mediaForm = document.getElementById('undergroundForm');
    if (mediaForm) {
        mediaForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert(getLang() === 'en'
                ? 'Request successfully sent to the Dead People Activity archive. Your data will be processed for the European register.'
                : 'Richiesta inviata con successo all\'archivio di Dead People Activity. I dati verranno elaborati per il registro europeo.');
            mediaForm.reset();
        });
    }

    // ---- Link legali nel footer (tutte le pagine) ----
    const footBottom = document.querySelector('.footer-bottom');
    if (footBottom && !footBottom.querySelector('.legal-links')) {
        const legal = document.createElement('p');
        legal.className = 'legal-links';
        legal.style.cssText = 'margin-top:10px;font-family:var(--font-punk-body);font-size:0.8rem;';
        legal.innerHTML =
            '<a href="privacy.html" style="color:var(--accent-color);">Privacy &amp; Cookie</a>'
          + ' &middot; <a href="affiliazioni.html" style="color:var(--accent-color);">Affiliazioni</a>'
          + ' &middot; <a href="contatti.html" style="color:var(--accent-color);">Contatti</a>';
        footBottom.appendChild(legal);
    }

    // ---- Banner cookie (tutte le pagine) ----
    (function cookieBar() {
        let choice = null;
        try { choice = localStorage.getItem('dpa_cookie_choice'); } catch (e) {}
        if (choice) return;   // gia' scelto: niente banner

        const bar = document.createElement('div');
        bar.id = 'cookie-bar';
        bar.style.cssText =
            'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#000000;'
          + 'border-top:3px dashed var(--accent-color);padding:14px 18px;display:flex;'
          + 'gap:14px;flex-wrap:wrap;align-items:center;justify-content:center;color:#ffffff;'
          + 'font-family:var(--font-punk-body);font-size:0.9rem;';
        bar.innerHTML =
            '<span style="max-width:640px;">Usiamo cookie tecnici e, con il tuo consenso, cookie di terze parti '
          + '(mappe e link ai biglietti/affiliati). Dettagli nella '
          + '<a href="privacy.html" style="color:var(--accent-color);">Privacy &amp; Cookie</a>.</span>';

        const mkBtn = (txt, val, primary) => {
            const b = document.createElement('button');
            b.textContent = txt;
            b.style.cssText =
                'font-family:var(--font-punk-headers);text-transform:uppercase;cursor:pointer;'
              + 'padding:8px 16px;border:2px solid #ffffff;'
              + (primary ? 'background:var(--accent-color);color:#ffffff;' : 'background:#000000;color:#ffffff;');
            b.addEventListener('click', () => {
                try { localStorage.setItem('dpa_cookie_choice', val); } catch (e) {}
                bar.remove();
            });
            return b;
        };
        bar.appendChild(mkBtn('Rifiuta', 'reject', false));
        bar.appendChild(mkBtn('Accetta', 'accept', true));
        document.body.appendChild(bar);
    })();

    // ---- Popup scelta lingua al primo accesso ----
    function showLangChooser(suggested) {
        if (document.getElementById("lang-chooser")) return;
        var ov = document.createElement("div");
        ov.id = "lang-chooser";
        ov.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.82);"
            + "display:flex;align-items:center;justify-content:center;padding:20px;";
        var box = document.createElement("div");
        box.style.cssText = "background:#000;border:3px dashed var(--accent-color);"
            + "box-shadow:8px 8px 0 rgba(0,0,0,0.6);max-width:360px;width:100%;padding:26px;text-align:center;";
        box.innerHTML =
            '<h3 style="font-family:var(--font-punk-headers);color:#fff;text-transform:uppercase;margin:0 0 6px;">Lingua / Language</h3>'
          + '<p style="font-family:var(--font-punk-body);color:var(--text-muted);font-size:0.9rem;margin:0 0 18px;">Scegli la lingua del sito &middot; Choose your language</p>';
        var row = document.createElement("div");
        row.style.cssText = "display:flex;gap:12px;justify-content:center;";
        function mk(lang, label) {
            var b = document.createElement("button");
            b.type = "button"; b.textContent = label;
            var primary = (lang === suggested);
            b.style.cssText = "flex:1;font-family:var(--font-punk-headers);text-transform:uppercase;cursor:pointer;"
                + "padding:12px 10px;border:2px solid #fff;font-size:1rem;"
                + (primary ? "background:var(--accent-color);color:#fff;" : "background:#000;color:#fff;");
            b.addEventListener("click", function () {
                setLang(lang); applyLang(lang);
                var t = document.querySelector(".lang-toggle");
                if (t) t.textContent = (lang === "en" ? "IT" : "EN");
                ov.remove();
            });
            return b;
        }
        row.appendChild(mk("it", "Italiano"));
        row.appendChild(mk("en", "English"));
        box.appendChild(row);
        ov.appendChild(box);
        document.body.appendChild(ov);
    }

    // ---- Attiva assistente e motore multilingua ----
    injectGlobalChatbot();
    if (window.DPA_I18N) window.DPA_I18N.init();
});
