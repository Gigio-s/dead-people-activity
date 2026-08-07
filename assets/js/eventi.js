(function () {
    "use strict";

    var PAGE_SIZE = 24;
    var ALL = [];
    var FILTERED = [];
    var visible = PAGE_SIZE;
    var userPos = null;
    var nearActive = false;

    var CODE2IT = {
        IT: "Italia", ES: "Spagna", FR: "Francia", DE: "Germania",
        GB: "Regno Unito", IE: "Irlanda", NL: "Paesi Bassi", BE: "Belgio",
        PT: "Portogallo", AT: "Austria", CH: "Svizzera", SE: "Svezia",
        NO: "Norvegia", DK: "Danimarca", FI: "Finlandia", PL: "Polonia",
        CZ: "Rep. Ceca", GR: "Grecia", HU: "Ungheria", RO: "Romania",
        HR: "Croazia", RS: "Serbia", UA: "Ucraina", SK: "Slovacchia",
        SI: "Slovenia", RU: "Russia"
    };
    var EN2IT = {
        Italy: "Italia", Spain: "Spagna", France: "Francia", Germany: "Germania",
        "United Kingdom": "Regno Unito", Ireland: "Irlanda", Netherlands: "Paesi Bassi",
        Belgium: "Belgio", Portugal: "Portogallo", Austria: "Austria",
        Switzerland: "Svizzera", Sweden: "Svezia", Norway: "Norvegia",
        Denmark: "Danimarca", Finland: "Finlandia", Poland: "Polonia",
        "Czech Republic": "Rep. Ceca", Czechia: "Rep. Ceca", Greece: "Grecia"
    };

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        if (!document.getElementById("eventsGrid")) return;
        wireUI();
        loadEvents().then(function (events) {
            var today = localISODate(new Date());
            ALL = (Array.isArray(events) ? events : []).filter(function (ev) {
                return ev && ev.stato !== "BURIED" && ev.data && ev.data >= today;
            }).map(normalizeEvent).sort(sortByDate);
            populateFilters();
            applyFilters();
        }).catch(showLoadError);
    }

    function loadEvents() {
        return fetch("assets/data/events.json")
            .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
            .catch(function () {
                if (Array.isArray(window.DPA_EVENTS_FALLBACK)) return window.DPA_EVENTS_FALLBACK;
                throw new Error("Dati eventi non disponibili");
            });
    }

    function normalizeEvent(ev) {
        var copy = Object.assign({}, ev);
        copy.paese = CODE2IT[copy.paese_code] || EN2IT[copy.paese] || copy.paese || "";
        copy.citta = copy.citta || "";
        copy.genere = Array.isArray(copy.genere) ? copy.genere.filter(Boolean) : [];
        copy._genreGroup = genreGroup(copy.genere);
        copy._search = [copy.nome, copy.citta, copy.paese, copy.locale, copy.indirizzo]
            .concat(copy.artisti || [], copy.genere).join(" ").toLowerCase();
        return copy;
    }

    function genreGroup(genres) {
        var list = Array.isArray(genres) ? genres : [];
        for (var i = 0; i < list.length; i++) {
            var text = String(list[i] || "").toLowerCase();
            if (/hip.?hop|rap|trap|drill|grime/.test(text)) return "rap";
            if (/techno|electro|house|dance|club|trance|ambient|dubstep|drum|dj|rave/.test(text)) return "electronic";
            if (/rock|alternative|noise|shoegaze|grunge|psych|garage|punk|hardcore|crust|d-beat|emo|screamo|metal|grind|doom|deathcore|blackgaze|pop|indie/.test(text)) return "rock";
        }
        return "rock";
    }

    function populateFilters() {
        fillSelect("ev-country", unique(ALL.map(function (e) { return e.paese; })), "Tutti i Paesi");
        fillSelect("ev-type", unique(ALL.map(function (e) { return e.tipo; })), "Tutte");
        refreshCities();
    }

    function refreshCities() {
        var country = value("ev-country");
        var current = value("ev-city");
        var cities = unique(ALL.filter(function (e) { return !country || e.paese === country; })
            .map(function (e) { return e.citta; }));
        fillSelect("ev-city", cities, "Tutte le Città");
        if (cities.indexOf(current) !== -1) document.getElementById("ev-city").value = current;
    }

    function fillSelect(id, values, firstLabel) {
        var el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '<option value="">' + esc(firstLabel) + "</option>" + values.map(function (v) {
            return '<option value="' + esc(v) + '">' + esc(labelType(v)) + "</option>";
        }).join("");
    }

    function wireUI() {
        var form = document.getElementById("eventsFilters");
        var searchTimer;
        form.addEventListener("change", function (ev) {
            if (ev.target.id === "ev-country") refreshCities();
            applyFilters();
        });
        document.getElementById("ev-search").addEventListener("input", function () {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(applyFilters, 180);
        });
        document.getElementById("ev-near").addEventListener("click", toggleNear);
        document.getElementById("ev-radius").addEventListener("input", function () {
            document.getElementById("ev-radius-value").textContent = this.value + " km";
            if (nearActive) applyFilters();
        });
        document.getElementById("ev-reset").addEventListener("click", function () {
            ["ev-search", "ev-country", "ev-city", "ev-genre", "ev-type", "ev-from", "ev-to"].forEach(function (id) {
                document.getElementById(id).value = "";
            });
            document.getElementById("ev-free").checked = false;
            deactivateNear();
            refreshCities();
            applyFilters();
        });
        document.getElementById("eventsMore").addEventListener("click", function () {
            visible += PAGE_SIZE;
            render();
        });
    }

    function applyFilters() {
        var q = value("ev-search").trim().toLowerCase();
        var country = value("ev-country");
        var city = value("ev-city");
        var genre = value("ev-genre");
        var type = value("ev-type");
        var from = value("ev-from");
        var to = value("ev-to");
        var free = document.getElementById("ev-free").checked;
        var radius = Number(value("ev-radius")) || 25;

        FILTERED = ALL.filter(function (ev) {
            if (q && ev._search.indexOf(q) === -1) return false;
            if (country && ev.paese !== country) return false;
            if (city && ev.citta !== city) return false;
            if (genre && ev._genreGroup !== genre) return false;
            if (type && ev.tipo !== type) return false;
            if (from && ev.data < from) return false;
            if (to && ev.data > to) return false;
            if (free && !ev.gratuito) return false;
            if (nearActive) {
                if (!hasCoords(ev)) return false;
                ev._distance = haversine(userPos.lat, userPos.lng, ev.lat, ev.lng);
                if (ev._distance > radius) return false;
            } else {
                delete ev._distance;
            }
            return true;
        });
        if (nearActive) FILTERED.sort(function (a, b) { return a._distance - b._distance || sortByDate(a, b); });
        visible = PAGE_SIZE;
        render();
    }

    function render() {
        var grid = document.getElementById("eventsGrid");
        var shown = FILTERED.slice(0, visible);
        grid.innerHTML = shown.map(cardHtml).join("");
        grid.setAttribute("aria-busy", "false");

        var count = document.getElementById("eventsCount");
        count.textContent = FILTERED.length.toLocaleString("it-IT") +
            (FILTERED.length === 1 ? " evento trovato" : " eventi trovati");
        document.getElementById("eventsOrder").textContent = nearActive ? "Ordinati per distanza" : "Ordinati per data";
        document.getElementById("eventsEmpty").hidden = FILTERED.length !== 0;

        var more = document.getElementById("eventsMore");
        more.hidden = visible >= FILTERED.length;
        if (!more.hidden) more.textContent = "Mostra altri eventi (" + shown.length + " di " + FILTERED.length.toLocaleString("it-IT") + ")";
    }

    function cardHtml(ev) {
        var place = [ev.locale, ev.citta, ev.paese].filter(Boolean).join(" · ");
        var genres = ev.genere.slice(0, 3);
        var price = ev.gratuito ? '<span class="event-price event-free">Gratis</span>' :
            (ev.prezzo !== null && ev.prezzo !== undefined ? '<span class="event-price">da ' + esc(ev.prezzo) + ' €</span>' : "");
        var mapUrl = "mappa.html?evento=" + encodeURIComponent(ev.id);
        var ticket = safeUrl(ev.biglietti_url);
        var ticketButton = ticket ? '<a class="event-action event-ticket" href="' + esc(ticket) +
            '" target="_blank" rel="noopener sponsored">Biglietti</a>' : "";

        var distance = Number.isFinite(ev._distance) ? '<span>' + formatDistance(ev._distance) + " da te</span>" : "";
        return '<article class="event-calendar-card genre-' + ev._genreGroup + '">' +
            '<div class="event-card-top"><time datetime="' + esc(ev.data) + '">' + formatDate(ev.data) +
            (ev.ora ? '<small>' + esc(shortTime(ev.ora)) + "</small>" : "") + "</time>" + price + "</div>" +
            '<h2 class="event-calendar-title">' + esc(ev.nome || "Evento") + "</h2>" +
            '<p class="event-calendar-place">' + esc(place || "Luogo da definire") + "</p>" +
            '<div class="event-tags genre-color-tags">' + genres.map(function (g) { return "<span>" + esc(g) + "</span>"; }).join("") + "</div>" +
            '<div class="event-card-meta"><span>' + esc(labelType(ev.tipo || "evento")) + distance + '<span>via ' + esc(provider(ev.fonte)) + "</span></div>" +
            '<div class="event-card-actions"><a class="event-action" href="' + esc(mapUrl) + '">Dettagli e biglietti</a>' + ticketButton + "</div>" +
            "</article>";
    }

    function showLoadError() {
        document.getElementById("eventsGrid").setAttribute("aria-busy", "false");
        document.getElementById("eventsCount").textContent = "Eventi non disponibili";
        var empty = document.getElementById("eventsEmpty");
        empty.hidden = false;
        empty.textContent = "Impossibile caricare il calendario. Riprova tra poco.";
    }

    function toggleNear() {
        if (nearActive) {
            deactivateNear();
            applyFilters();
            return;
        }
        var status = document.getElementById("eventsGeoStatus");
        if (!navigator.geolocation) {
            status.textContent = "Posizione non disponibile su questo dispositivo.";
            return;
        }
        status.textContent = "Richiesta posizione…";
        navigator.geolocation.getCurrentPosition(function (pos) {
            userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            nearActive = true;
            var button = document.getElementById("ev-near");
            button.classList.add("active");
            button.setAttribute("aria-pressed", "true");
            document.getElementById("ev-radius").disabled = false;
            status.textContent = "Posizione attiva.";
            applyFilters();
        }, function () {
            status.textContent = "Posizione non concessa. Puoi riprovare dal pulsante.";
        }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    }

    function deactivateNear() {
        nearActive = false;
        userPos = null;
        var button = document.getElementById("ev-near");
        button.classList.remove("active");
        button.setAttribute("aria-pressed", "false");
        document.getElementById("ev-radius").disabled = true;
        document.getElementById("eventsGeoStatus").textContent = "";
    }

    function hasCoords(ev) {
        return ev && Number.isFinite(ev.lat) && Number.isFinite(ev.lng) &&
            ev.lat >= -90 && ev.lat <= 90 && ev.lng >= -180 && ev.lng <= 180;
    }
    function haversine(lat1, lng1, lat2, lng2) {
        var earthRadius = 6371;
        var toRad = function (degrees) { return degrees * Math.PI / 180; };
        var dLat = toRad(lat2 - lat1);
        var dLng = toRad(lng2 - lng1);
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    function formatDistance(km) { return km < 10 ? km.toFixed(1) + " km" : Math.round(km) + " km"; }

    function safeUrl(url) {
        if (!url) return "";
        try {
            var parsed = new URL(url, window.location.href);
            return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
        } catch (_) { return ""; }
    }
    function value(id) { var el = document.getElementById(id); return el ? el.value : ""; }
    function unique(values) { return Array.from(new Set(values.filter(Boolean))).sort(function (a, b) { return a.localeCompare(b, "it"); }); }
    function sortByDate(a, b) { return (a.data + (a.ora || "")).localeCompare(b.data + (b.ora || "")); }
    function shortTime(time) { return String(time).slice(0, 5); }
    function localISODate(date) {
        return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
    }
    function formatDate(date) {
        var d = new Date(date + "T00:00:00");
        return isNaN(d.getTime()) ? date : d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
    }
    function labelType(type) {
        return String(type || "").replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }
    function provider(source) {
        return ({ ticketmaster: "Ticketmaster", dice: "DICE", skiddle: "Skiddle", ra: "Resident Advisor", bandsintown: "Bandsintown" })[source] || source || "DPA";
    }
    function esc(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
}());
