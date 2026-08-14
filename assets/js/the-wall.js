/* ==========================================================================
   THE WALL — Dead People Activity
   Bacheca post-it con commenti. Backend: Supabase (moderazione: niente
   pubblicazione automatica). Finche non configuri le due chiavi qui sotto,
   la pagina gira in MODALITA DEMO (post-it di esempio, invii disabilitati).
   ========================================================================== */
(function () {
    "use strict";

    /* -----------------------------------------------------------------
       1) CONFIGURAZIONE — incolla qui i due valori del tuo progetto:
          Supabase -> Project Settings -> API
          - Project URL      -> SUPABASE_URL
          - anon public key   -> SUPABASE_ANON_KEY
       La anon key e pensata per stare nel browser: e sicura.
       ----------------------------------------------------------------- */
    var CONFIG = {
        SUPABASE_URL: "https://rddivxbkaeunxqmccoio.supabase.co",
        SUPABASE_ANON_KEY: "sb_publishable_mhmT-2xD_2j1N5NDMRGj_Q_ioecvmG2"
    };

    var GENRES = {
        rock:   { label: "Rock / Punk" },
        rap:    { label: "Rap / Hip-Hop" },
        techno: { label: "Techno / Elettronica" },
        neutral:{ label: "Altro" }
    };

    var DEMO_POSTS = [
        { id: "demo1", genre: "rock",   author: "nessuno",  body: "Cerco batterista per progetto crust-punk. Zona Vicenza. Niente pose, solo rumore.", created_at: null, _demo: true },
        { id: "demo2", genre: "rap",    author: "9mm",      body: "Open mic ogni giovedi, seminterrato di sempre. Porta le tue barre o stai zitto.", created_at: null, _demo: true },
        { id: "demo3", genre: "techno", author: "K-oz",     body: "Rave non autorizzato, coordinate all'ultimo. Seguite il filo rosso.", created_at: null, _demo: true },
        { id: "demo4", genre: "rock",   author: null,       body: "VENDO ampli a valvole mezzo bruciato. Suona meglio cosi.", created_at: null, _demo: true },
        { id: "demo5", genre: "neutral",author: "archivista",body: "Sto digitalizzando volantini 1998-2004. Se hai materiale, scrivi.", created_at: null, _demo: true }
    ];

    /* -----------------------------------------------------------------
       2) STATO / CLIENT
       ----------------------------------------------------------------- */
    var isConfigured =
        CONFIG.SUPABASE_URL.indexOf("INCOLLA") === -1 &&
        CONFIG.SUPABASE_ANON_KEY.indexOf("INCOLLA") === -1;

    var db = null;
    if (isConfigured && window.supabase && window.supabase.createClient) {
        db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    }

    var grid   = document.getElementById("wallGrid");
    var notice = document.getElementById("wallNotice");
    if (!grid) return;  // non siamo sulla pagina The Wall: esci senza errori

    /* -----------------------------------------------------------------
       3) UTIL
       ----------------------------------------------------------------- */
    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    function genreLabel(g) { return (GENRES[g] || GENRES.neutral).label; }
    function fmtDate(iso) {
        if (!iso) return "";
        try { return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }); }
        catch (e) { return ""; }
    }

    /* -----------------------------------------------------------------
       4) RENDER POST-IT
       ----------------------------------------------------------------- */
    function postitHTML(p) {
        var g = GENRES[p.genre] ? p.genre : "neutral";
        var author = p.author ? '<span class="postit-author">' + esc(p.author) + '</span>' : '<span></span>';
        var date = p.created_at ? '<span>' + fmtDate(p.created_at) + '</span>' : '<span></span>';
        var commentsBtn = p._demo
            ? ''
            : '<button class="postit-comments-toggle" data-id="' + esc(p.id) + '">commenti</button>';
        return '' +
            '<article class="postit" data-genre="' + g + '">' +
                '<span class="postit-genre">' + esc(genreLabel(g)) + '</span>' +
                '<div class="postit-body">' + esc(p.body) + '</div>' +
                '<div class="postit-meta">' + author + date + '</div>' +
                commentsBtn +
                '<div class="postit-comments" data-for="' + esc(p.id) + '" hidden></div>' +
            '</article>';
    }

    function renderPosts(posts) {
        if (!posts || !posts.length) {
            grid.innerHTML = '<p class="wall-empty">Il muro e ancora vuoto. Attacca il primo post-it.</p>';
            return;
        }
        grid.innerHTML = posts.map(postitHTML).join("");
        bindCommentToggles();
    }

    /* -----------------------------------------------------------------
       5) COMMENTI
       ----------------------------------------------------------------- */
    function bindCommentToggles() {
        var btns = grid.querySelectorAll(".postit-comments-toggle");
        Array.prototype.forEach.call(btns, function (btn) {
            btn.addEventListener("click", function () {
                var id = btn.getAttribute("data-id");
                var box = grid.querySelector('.postit-comments[data-for="' + CSS.escape(id) + '"]');
                if (!box) return;
                if (box.hidden) { box.hidden = false; loadComments(id, box); }
                else { box.hidden = true; }
            });
        });
    }

    function commentFormHTML(postId) {
        return '' +
            '<form class="postit-comment-form" data-post="' + esc(postId) + '">' +
                '<input type="text" name="author" maxlength="40" placeholder="nome (facoltativo)">' +
                '<textarea name="body" maxlength="300" required placeholder="commenta..."></textarea>' +
                '<button type="submit">Invia commento</button>' +
                '<div class="postit-comment-status" hidden></div>' +
            '</form>';
    }

    function loadComments(postId, box) {
        box.innerHTML = '<div class="postit-comment">Carico...</div>';
        if (!db) { box.innerHTML = commentFormHTML(postId); bindCommentForm(box); return; }
        db.from("wall_comments")
          .select("id, author, body, created_at")
          .eq("post_id", postId).eq("approved", true)
          .order("created_at", { ascending: true })
          .then(function (res) {
              var rows = res.data || [];
              var html = rows.map(function (c) {
                  return '<div class="postit-comment"><span class="c-author">' +
                         esc(c.author || "anonimo") + '</span>' + esc(c.body) + '</div>';
              }).join("");
              if (!html) html = '<div class="postit-comment">Nessun commento. Rompi il silenzio.</div>';
              box.innerHTML = html + commentFormHTML(postId);
              bindCommentForm(box);
          });
    }

    function bindCommentForm(box) {
        var form = box.querySelector(".postit-comment-form");
        if (!form) return;
        form.addEventListener("submit", function (e) {
            e.preventDefault();
            var status = form.querySelector(".postit-comment-status");
            var body = (form.body.value || "").trim();
            var author = (form.author.value || "").trim();
            if (!body) return;
            if (!db) { showStatus(status, "Backend non ancora collegato (demo).", false); return; }
            form.querySelector("button").disabled = true;
            db.from("wall_comments").insert([{ post_id: form.getAttribute("data-post"), author: author || null, body: body, approved: false }])
              .then(function (res) {
                  if (res.error) { showStatus(status, "Errore: " + res.error.message, false); form.querySelector("button").disabled = false; }
                  else { loadComments(form.getAttribute("data-post"), box); }  // ricarica: i commenti puliti compaiono subito
              });
        });
    }
    function showStatus(el, msg, ok) {
        if (!el) return;
        el.hidden = false; el.textContent = msg;
        el.style.color = ok ? "#0a5" : "#a00";
    }

    /* -----------------------------------------------------------------
       6) FORM NUOVO POST-IT
       ----------------------------------------------------------------- */
    var openBtn  = document.getElementById("wallOpenForm");
    var formWrap = document.getElementById("wallFormWrap");
    var form     = document.getElementById("wallForm");
    var formStatus = document.getElementById("wallFormStatus");

    if (openBtn && formWrap) {
        openBtn.addEventListener("click", function () {
            formWrap.hidden = !formWrap.hidden;
            if (!formWrap.hidden) formWrap.scrollIntoView({ behavior: "smooth", block: "center" });
        });
    }

    if (form) {
        form.addEventListener("submit", function (e) {
            e.preventDefault();
            if (form.website && form.website.value) return;  // honeypot: e un bot
            var body = (form.body.value || "").trim();
            var author = (form.author.value || "").trim();
            var genreEl = form.querySelector('input[name="genre"]:checked');
            var genre = genreEl ? genreEl.value : "neutral";
            if (!body) { setFormStatus("Scrivi qualcosa sul post-it.", false); return; }

            if (!db) {
                setFormStatus("MODALITA DEMO: il backend non e ancora collegato, quindi l'invio non e attivo. Configura Supabase per aprire il muro davvero.", false);
                return;
            }
            var submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;
            db.from("wall_posts").insert([{ author: author || null, body: body, genre: genre, approved: false }])
              .then(function (res) {
                  if (res.error) { setFormStatus("Errore: " + res.error.message, false); }
                  else {
                      form.reset();
                      setFormStatus("Post-it inviato! Se e pulito e gia sul muro qui sotto; se contiene link o parole segnalate passa dalla revisione.", true);
                      loadWall();   // aggiorna subito il muro: i post puliti compaiono senza refresh
                  }
                  if (submitBtn) submitBtn.disabled = false;
              });
        });
    }
    function setFormStatus(msg, ok) {
        if (!formStatus) return;
        formStatus.textContent = msg;
        formStatus.className = "wall-form-status " + (ok ? "ok" : "err");
    }

    /* -----------------------------------------------------------------
       7) AVVIO
       ----------------------------------------------------------------- */
    function boot() {
        if (!db) {
            if (notice) {
                notice.innerHTML = '<strong>Modalita demo.</strong> Questi post-it sono di esempio. ' +
                    'Per far postare davvero gli utenti (con moderazione), collega Supabase: vedi la guida <em>GUIDA_THE_WALL.md</em>.';
            }
            renderPosts(DEMO_POSTS);
            return;
        }
        if (notice) {
            notice.innerHTML = '<strong>Muro attivo.</strong> I post puliti compaiono subito; ' +
                'quelli con link o parole segnalate passano dalla revisione.';
        }
        loadWall();
    }

    // Ricarica i post approvati e ridisegna il muro (usata all'avvio e dopo un invio)
    function loadWall() {
        grid.innerHTML = '<p class="wall-empty">Carico il muro...</p>';
        db.from("wall_posts")
          .select("id, author, body, genre, created_at")
          .eq("approved", true)
          .order("created_at", { ascending: false })
          .then(function (res) {
              if (res.error) {
                  grid.innerHTML = '<p class="wall-empty">Errore nel caricamento: ' + esc(res.error.message) + '</p>';
                  return;
              }
              renderPosts(res.data);
          });
    }

    boot();
})();
