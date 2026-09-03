/* Dettaglio rapido degli eventi nelle directory SEO locali. */
(function () {
    'use strict';

    var activePanel = null;
    var activeCard = null;
    var miniMap = null;

    var WORDS = {
        it: { close: 'Chiudi', date: 'Data', place: 'Luogo', address: 'Indirizzo', city: 'Città', artists: 'Artisti', genre: 'Genere', type: 'Tipologia', price: 'Prezzo', source: 'Fonte', free: 'Ingresso gratuito', unavailable: 'n/d', buy: 'Scegli dove acquistare', tickets: 'Biglietti su', full: 'Apri nella mappa completa', noCoords: 'Coordinate non ancora disponibili.' },
        en: { close: 'Close', date: 'Date', place: 'Venue', address: 'Address', city: 'City', artists: 'Artists', genre: 'Genre', type: 'Type', price: 'Price', source: 'Source', free: 'Free entry', unavailable: 'n/a', buy: 'Choose where to buy', tickets: 'Tickets on', full: 'Open in the full map', noCoords: 'Coordinates are not available yet.' },
        es: { close: 'Cerrar', date: 'Fecha', place: 'Lugar', address: 'Dirección', city: 'Ciudad', artists: 'Artistas', genre: 'Género', type: 'Tipo', price: 'Precio', source: 'Fuente', free: 'Entrada gratuita', unavailable: 'n/d', buy: 'Elige dónde comprar', tickets: 'Entradas en', full: 'Abrir en el mapa completo', noCoords: 'Las coordenadas aún no están disponibles.' },
        ca: { close: 'Tanca', date: 'Data', place: 'Lloc', address: 'Adreça', city: 'Ciutat', artists: 'Artistes', genre: 'Gènere', type: 'Tipus', price: 'Preu', source: 'Font', free: 'Entrada gratuïta', unavailable: 'n/d', buy: 'Tria on comprar', tickets: 'Entrades a', full: 'Obre al mapa complet', noCoords: 'Les coordenades encara no estan disponibles.' },
        de: { close: 'Schließen', date: 'Datum', place: 'Ort', address: 'Adresse', city: 'Stadt', artists: 'Künstler', genre: 'Genre', type: 'Typ', price: 'Preis', source: 'Quelle', free: 'Eintritt frei', unavailable: 'k. A.', buy: 'Ticketanbieter wählen', tickets: 'Tickets bei', full: 'In der vollständigen Karte öffnen', noCoords: 'Koordinaten sind noch nicht verfügbar.' },
        fr: { close: 'Fermer', date: 'Date', place: 'Lieu', address: 'Adresse', city: 'Ville', artists: 'Artistes', genre: 'Genre', type: 'Type', price: 'Prix', source: 'Source', free: 'Entrée gratuite', unavailable: 'n/d', buy: 'Choisissez où acheter', tickets: 'Billets sur', full: 'Ouvrir dans la carte complète', noCoords: 'Les coordonnées ne sont pas encore disponibles.' }
    };

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
        });
    }

    function words() {
        var lang = String(document.documentElement.lang || 'it').split('-')[0];
        return WORDS[lang] || WORDS.en;
    }

    function provider(value) {
        var labels = { ticketmaster: 'Ticketmaster', dice: 'DICE', skiddle: 'Skiddle', ra: 'Resident Advisor', bandsintown: 'Bandsintown', community: 'Community' };
        var key = String(value || '').toLowerCase();
        return labels[key] || value || 'DPA';
    }

    function safeUrl(value) {
        try {
            var url = new URL(String(value || ''));
            return /^https?:$/.test(url.protocol) ? url.href : '';
        } catch (_) { return ''; }
    }

    function ticketOptions(event) {
        var choices = Array.isArray(event.biglietti) ? event.biglietti.slice() : [];
        if (event.biglietti_url) choices.push({ fonte: event.fonte, url: event.biglietti_url, prezzo: event.prezzo, gratuito: event.gratuito });
        var seen = {};
        return choices.filter(function (choice) {
            var url = safeUrl(choice && choice.url);
            if (!url || seen[url]) return false;
            seen[url] = true;
            choice.url = url;
            return true;
        });
    }

    function formattedDate(value) {
        if (!value) return '';
        try { return new Date(value + 'T00:00:00').toLocaleDateString(document.documentElement.lang || 'it', { day: '2-digit', month: 'long', year: 'numeric' }); }
        catch (_) { return value; }
    }

    function destroyPanel() {
        if (miniMap) { miniMap.remove(); miniMap = null; }
        if (activePanel) activePanel.remove();
        if (activeCard) activeCard.querySelector('.local-event-summary').setAttribute('aria-expanded', 'false');
        activePanel = null;
        activeCard = null;
    }

    function tableRow(label, value) {
        return '<tr><th>' + esc(label) + '</th><td>' + esc(value) + '</td></tr>';
    }

    function openCard(card) {
        if (activeCard === card) { destroyPanel(); return; }
        destroyPanel();
        var event;
        try { event = JSON.parse(card.getAttribute('data-event') || '{}'); } catch (_) { return; }
        var t = words();
        var tickets = ticketOptions(event);
        var price = event.gratuito ? t.free : (event.prezzo != null && event.prezzo !== '' ? String(event.prezzo) + ' €' : t.unavailable);
        var rows = '';
        rows += tableRow(t.date, formattedDate(event.data) + (event.ora ? ' · ' + event.ora : ''));
        rows += tableRow(t.place, event.locale || t.unavailable);
        rows += tableRow(t.address, event.indirizzo || t.unavailable);
        rows += tableRow(t.city, [event.citta, event.regione, event.paese].filter(Boolean).join(', '));
        rows += tableRow(t.artists, (event.artisti || []).join(', ') || t.unavailable);
        rows += tableRow(t.genre, (event.genere || []).join(', ') || t.unavailable);
        rows += tableRow(t.type, event.tipo || t.unavailable);
        rows += tableRow(t.price, price);
        rows += tableRow(t.source, tickets.length ? tickets.map(function (item) { return provider(item.fonte); }).filter(function (value, index, list) { return list.indexOf(value) === index; }).join(', ') : provider(event.fonte));

        var ticketHtml = tickets.length ? '<div class="local-ticket-options"><h3>' + esc(t.buy) + '</h3>' + tickets.map(function (item) {
            return '<a class="btn btn-primary" href="' + esc(item.url) + '" target="_blank" rel="noopener sponsored">' + esc(t.tickets + ' ' + provider(item.fonte)) + '</a>';
        }).join('') + '</div>' : '';
        var fullMap = 'mappa.html?' + new URLSearchParams({ evento: event.id || '' }).toString();
        var hasCoords = Number.isFinite(event.lat) && Number.isFinite(event.lng) && !(event.lat === 0 && event.lng === 0);

        var panel = document.createElement('section');
        panel.className = 'local-event-detail';
        panel.innerHTML = '<button type="button" class="local-detail-close" aria-label="' + esc(t.close) + '">×</button>' +
            '<div class="local-detail-map">' + (hasCoords ? '<div class="local-mini-map"></div>' : '<p>' + esc(t.noCoords) + '</p>') + '</div>' +
            '<div class="local-detail-content"><span class="status-badge status-live">' + esc(event.stato || 'LIVE') + '</span>' +
            '<h2>' + esc(event.nome) + '</h2>' + (event.descrizione ? '<p class="detail-desc">' + esc(event.descrizione) + '</p>' : '') +
            '<table class="detail-table"><tbody>' + rows + '</tbody></table>' + ticketHtml +
            '<a class="local-full-map-link" href="' + esc(fullMap) + '">' + esc(t.full) + ' →</a></div>';
        card.insertAdjacentElement('afterend', panel);
        card.querySelector('.local-event-summary').setAttribute('aria-expanded', 'true');
        panel.querySelector('.local-detail-close').addEventListener('click', destroyPanel);
        activePanel = panel;
        activeCard = card;

        if (hasCoords && window.L) {
            var mapElement = panel.querySelector('.local-mini-map');
            miniMap = L.map(mapElement, { scrollWheelZoom: false }).setView([event.lat, event.lng], 15);
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'dpa-dark-map-tiles', attribution: '&copy; OpenStreetMap' }).addTo(miniMap);
            L.marker([event.lat, event.lng], { icon: L.divIcon({ className: 'dpa-pin-wrap', html: '<span class="dpa-pin"></span>', iconSize: [14, 14] }) }).addTo(miniMap);
            setTimeout(function () { if (miniMap) miniMap.invalidateSize(); }, 50);
        }
        panel.scrollIntoView({ behavior: 'smooth', block: window.matchMedia('(min-width: 901px)').matches ? 'start' : 'nearest' });
    }

    document.addEventListener('click', function (event) {
        var summary = event.target.closest('.local-event-summary');
        if (summary) openCard(summary.closest('.local-event-card'));
    });
}());
