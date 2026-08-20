/* ==========================================================================
   Dead People Activity - Mappa Eventi (navigazione drill-down)
   Livello EUROPA : solo confini nazionali (no marker). Hover -> rosso.
                    Click su un paese -> zoom dentro il paese.
   Livello PAESE  : mostra gli eventi del paese (eventi principali) +
                    scelta di citta' con raggio di ricerca (km).
   Livello ZONA   : eventi entro N km dalla citta' scelta.
   Confini: GeoJSON caricato da CDN pubblico. Se fallisce -> fallback marker.
   Dati DIMOSTRATIVI, schema pronto per backend/scraper (assets/data/events.json).
   ========================================================================== */
(function () {
    "use strict";

    var ALL = [];
    var map, cluster, countriesLayer = null, bordersOk = false;
    var level = "europa";              // europa | paese | zona
    var country = "", city = "";
    var cityCenters = {};              // "Paese|Citta" -> {lat,lng}
    var countryBounds = {};            // "PaeseIT" -> L.LatLngBounds
    var searchCircle = null;
    var focusedEvent = false;          // true quando si è aperto un evento (mappa zoomata sulla scheda)
    var fallbackPins = null;           // pin per-nazione mostrati se i confini non caricano
    var userPos = null;                // posizione utente (geolocalizzazione), se concessa

    var EUROPE_BOUNDS = [[35, -11], [70, 56]];
    // Confini paesi: piu' fonti in cascata (se una CDN è giù, prova la successiva)
    var BORDERS_URLS = [
        "assets/data/europe.geojson",   // LOCALE (crealo con scripts/scarica_confini.py): niente dipendenza da CDN
        "https://cdn.jsdelivr.net/gh/leakyMirror/map-of-europe@master/GeoJSON/europe.geojson",
        "https://raw.githubusercontent.com/leakyMirror/map-of-europe/master/GeoJSON/europe.geojson"
    ];
    var searchResults = [];  // risultati della barra di ricerca (livello "search")
    var quickFilter = "all"; // tutti | rock | rap | electronic | festival

    // Nomi paese GeoJSON (inglese) -> nostri nomi (italiano)
    var EN2IT = {
        "Italy": "Italia", "Spain": "Spagna", "United Kingdom": "Regno Unito",
        "France": "Francia", "Germany": "Germania", "Russia": "Russia",
        "Portugal": "Portogallo", "Netherlands": "Paesi Bassi", "Belgium": "Belgio",
        "Switzerland": "Svizzera", "Austria": "Austria", "Poland": "Polonia",
        "Czech Republic": "Rep. Ceca", "Czechia": "Rep. Ceca", "Greece": "Grecia",
        "Ireland": "Irlanda", "Denmark": "Danimarca", "Sweden": "Svezia",
        "Norway": "Norvegia", "Finland": "Finlandia", "Hungary": "Ungheria",
        "Romania": "Romania", "Croatia": "Croazia", "Serbia": "Serbia",
        "Ukraine": "Ucraina", "Slovakia": "Slovacchia", "Slovenia": "Slovenia"
    };
    function toIT(name) { return EN2IT[name] || name; }

    // Codice paese ISO -> nome italiano (deve combaciare con i valori di EN2IT).
    // Serve a uniformare gli eventi che arrivano col paese in inglese (es. Ticketmaster).
    var CODE2IT = {
        "IT": "Italia", "ES": "Spagna", "FR": "Francia", "DE": "Germania",
        "GB": "Regno Unito", "IE": "Irlanda", "NL": "Paesi Bassi", "BE": "Belgio",
        "PT": "Portogallo", "AT": "Austria", "CH": "Svizzera", "SE": "Svezia",
        "NO": "Norvegia", "DK": "Danimarca", "FI": "Finlandia", "PL": "Polonia",
        "CZ": "Rep. Ceca", "GR": "Grecia", "RU": "Russia", "HU": "Ungheria",
        "RO": "Romania", "HR": "Croazia", "RS": "Serbia", "UA": "Ucraina",
        "SK": "Slovacchia", "SI": "Slovenia"
    };
    // Uniforma il nome del paese di un evento all'italiano (per codice, poi per nome EN).
    function normalizzaPaese(e) {
        if (e.paese_code && CODE2IT[e.paese_code]) e.paese = CODE2IT[e.paese_code];
        else if (EN2IT[e.paese]) e.paese = EN2IT[e.paese];
        return e;
    }
    function hasCoords(e) {
        return e && Number.isFinite(e.lat) && Number.isFinite(e.lng) &&
            e.lat >= -90 && e.lat <= 90 && e.lng >= -180 && e.lng <= 180 &&
            !(e.lat === 0 && e.lng === 0);
    }

    function genreFamily(genres) {
        var list = Array.isArray(genres) ? genres : [];
        for (var i = 0; i < list.length; i++) {
            var text = String(list[i] || "").toLowerCase();
            if (/hip.?hop|rap|trap|drill|grime/.test(text)) return "rap";
            if (/techno|electro|house|dance|club|trance|ambient|dubstep|drum|dj|rave/.test(text)) return "electronic";
            if (/rock|alternative|noise|shoegaze|grunge|psych|garage|punk|hardcore|crust|d-beat|emo|screamo|metal|grind|doom|deathcore|blackgaze|pop|indie/.test(text)) return "rock";
        }
        return "rock";
    }
    function genreFamilyLabel(group) {
        if (group === "rap") return "Rap / Hip-Hop";
        if (group === "electronic") return "Techno / Elettronica";
        return "Rock / Punk / Metal / Indie";
    }
    function isFestival(ev) {
        if (String(ev && ev.tipo || "").toLowerCase() === "festival") return true;
        return /(^|\W)(festival|fest|openair|open air)(\W|$)/i.test(String(ev && ev.nome || ""));
    }

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        if (!document.getElementById("map")) return;
        loadEvents().then(function (events) {
            ALL = Array.isArray(events) ? events : [];
            ALL.forEach(normalizzaPaese);   // uniforma i nomi paese (inglese -> italiano)
            buildCityCenters();
            buildMap();
            populateFilters();
            wireUI();
            buildChatbot();
            loadBorders().then(function () {
                goEurope();
                if (!openEventFromQuery() && !openChatFiltersFromQuery()) maybeGeolocate();
            });
        });
    }

    function openEventFromQuery() {
        var id = new URLSearchParams(window.location.search).get("evento");
        if (!id) return false;
        var ev = byId(id);
        if (!ev) return false;
        focusEvent(ev, true);
        return true;
    }

    function openChatFiltersFromQuery() {
        var params = new URLSearchParams(window.location.search);
        var genre = params.get("genere") || "";
        var wantedCountry = params.get("paese") || "";
        if (!genre && !wantedCountry) return false;
        if (["rock", "rap", "electronic"].indexOf(genre) >= 0) setSel("f-genere", genre);
        if (wantedCountry) {
            wantedCountry = toIT(wantedCountry);
            var matched = uniq(ALL.map(function (e) { return e.paese; })).find(function (name) {
                return String(name || "").trim().toLowerCase() === String(wantedCountry || "").trim().toLowerCase();
            });
            if (matched) selectCountry(matched, countryBounds[matched]);
            else refreshCurrent();
        } else refreshCurrent();
        return true;
    }

    function loadEvents() {
        return fetch("assets/data/events.json")
            .then(function (r) { if (!r.ok) throw new Error("http"); return r.json(); })
            .catch(function () { return window.DPA_EVENTS_FALLBACK || []; });
    }

    function buildCityCenters() {
        var acc = {};
        ALL.forEach(function (e) {
            if (!hasCoords(e) || !e.paese || !e.citta) return;
            var k = e.paese + "|" + e.citta;
            var a = acc[k] || (acc[k] = { lat: 0, lng: 0, n: 0 });
            a.lat += e.lat; a.lng += e.lng; a.n++;
        });
        Object.keys(acc).forEach(function (k) {
            cityCenters[k] = { lat: acc[k].lat / acc[k].n, lng: acc[k].lng / acc[k].n };
        });
    }

    /* ---------- MAPPA ---------- */
    function buildMap() {
        map = L.map("map", { zoomControl: true, minZoom: 3, worldCopyJump: true });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
            subdomains: "abcd", maxZoom: 19, attribution: "&copy; OpenStreetMap, &copy; CARTO"
        }).addTo(map);
        map.fitBounds(EUROPE_BOUNDS);

        cluster = L.markerClusterGroup({
            showCoverageOnHover: false, maxClusterRadius: 45,
            iconCreateFunction: function (c) {
                return L.divIcon({ html: '<div class="dpa-cluster">' + c.getChildCount() + "</div>", className: "dpa-cluster-wrap", iconSize: [40, 40] });
            }
        });
    }

    function loadBorders() {
        var i = 0;
        function tryNext() {
            if (i >= BORDERS_URLS.length) {
                bordersOk = false;
                var n = document.getElementById("mapNotice");
                if (n) n.style.display = "block";
                return Promise.resolve();
            }
            var url = BORDERS_URLS[i++];
            return fetch(url)
                .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
                .then(function (geo) {
                    if (!geo || !geo.features || !geo.features.length) throw new Error("empty");
                    countriesLayer = L.geoJSON(geo, { style: countryStyle, onEachFeature: onCountry });
                    bordersOk = true;
                    var n = document.getElementById("mapNotice");
                    if (n) n.style.display = "none";
                })
                .catch(function () { return tryNext(); });
        }
        return tryNext();
    }

    function countryStyle() {
        return { fillColor: "#16161b", fillOpacity: 0.82, color: "#ffffff", weight: 1, opacity: 0.55, dashArray: "3" };
    }
    function countryHoverStyle() {
        return { fillColor: "#ff2a2a", fillOpacity: 0.75, color: "#ffffff", weight: 2, opacity: 1, dashArray: null };
    }

    function onCountry(feature, layer) {
        var enName = feature.properties && (feature.properties.NAME || feature.properties.name || feature.properties.NAME_EN);
        var itName = toIT(enName);
        countryBounds[itName] = layer.getBounds();
        var count = ALL.filter(function (e) { return e.paese === itName; }).length;
        layer.bindTooltip(itName + (count ? " &middot; " + count + " eventi" : ""), { className: "dpa-country-tip", sticky: true });
        layer.on("mouseover", function () { layer.setStyle(countryHoverStyle()); layer.bringToFront(); });
        layer.on("mouseout", function () { if (countriesLayer) countriesLayer.resetStyle(layer); });
        layer.on("click", function () { selectCountry(itName, layer.getBounds()); });
    }

    /* ---------- NAVIGAZIONE A LIVELLI ---------- */
    function goEurope() {
        level = "europa"; country = ""; city = ""; focusedEvent = false;
        setSel("f-paese", ""); setSel("f-citta", "");
        clearCircle();
        if (map.hasLayer(cluster)) map.removeLayer(cluster);
        removeFallbackPins();
        if (bordersOk && countriesLayer && !map.hasLayer(countriesLayer)) map.addLayer(countriesLayer);
        map.flyToBounds(EUROPE_BOUNDS);
        updateZonaControls();
        updateBreadcrumb();
        renderList();
        // Senza confini: pin cliccabili per nazione (drill-down garantito anche se la CDN è giù/bloccata)
        if (!bordersOk) drawCountryPins();
    }

    function selectCountry(itName, bounds) {
        level = "paese"; country = itName; city = ""; focusedEvent = false;
        setSel("f-paese", itName);
        updateCittaOptions(itName); setSel("f-citta", "");
        clearCircle();
        removeFallbackPins();
        if (bordersOk && countriesLayer && map.hasLayer(countriesLayer)) map.removeLayer(countriesLayer);
        if (!map.hasLayer(cluster)) map.addLayer(cluster);

        var evs = countryEvents();
        drawMarkers(evs);
        var b = bounds || countryBounds[itName];
        if (b) map.flyToBounds(b, { maxZoom: 7, padding: [30, 30] });
        else { var vp = ptsOf(evs); if (vp.length) map.flyToBounds(vp, { maxZoom: 8, padding: [40, 40] }); }

        updateZonaControls();
        updateBreadcrumb();
        renderList();
    }

    function selectCity(cityName) {
        if (!cityName) { if (country) selectCountry(country, countryBounds[country]); return; }
        level = "zona"; city = cityName; focusedEvent = false;
        var center = cityCenters[country + "|" + cityName];
        var r = radiusKm();
        clearCircle();
        if (center) {
            if (r > 0) {
                searchCircle = L.circle([center.lat, center.lng], {
                    radius: r * 1000, color: "#ff2a2a", weight: 2, dashArray: "5",
                    fillColor: "#ff2a2a", fillOpacity: 0.08
                }).addTo(map);
                map.flyToBounds(searchCircle.getBounds(), { padding: [40, 40] });
            } else {
                map.flyTo([center.lat, center.lng], 12);
            }
        }
        drawMarkers(zonaEvents());
        updateZonaControls();
        updateBreadcrumb();
        renderList();
    }

    /* ---------- FILTRI / DATASET ---------- */
    function val(id) { var e = document.getElementById(id); return e ? e.value : ""; }
    function checked(id) { var e = document.getElementById(id); return e ? e.checked : false; }
    function radiusKm() { return parseInt(val("f-raggio") || "0", 10) || 0; }

    function baseFilters() {
        return {
            genere: val("f-genere"), tipo: val("f-tipo"),
            data: val("f-data"), dataFine: val("f-data-fine"),
            gratis: checked("f-gratis"),
            q: (val("q-search") || "").trim().toLowerCase()
        };
    }
    function matchesBase(ev, f) {
        if (ev.stato === "BURIED") return false;
        if (quickFilter === "festival" && !isFestival(ev)) return false;
        if (f.genere && genreFamily(ev.genere) !== f.genere) return false;
        if (f.tipo && ev.tipo !== f.tipo) return false;
        if (f.gratis && !ev.gratuito) return false;
        if (f.data && ev.data < f.data) return false;
        if (f.dataFine && ev.data && ev.data > f.dataFine) return false;
        if (f.q) {
            var hay = ((ev.nome || "") + " " + (ev.artisti || []).join(" ") + " " + (ev.genere || []).join(" ")).toLowerCase();
            if (hay.indexOf(f.q) === -1) return false;
        }
        return true;
    }
    function applyBaseFilters(list) { var f = baseFilters(); return list.filter(function (e) { return matchesBase(e, f); }); }

    function countryEvents() {
        return applyBaseFilters(ALL.filter(function (e) { return e.paese === country; }));
    }
    function zonaEvents() {
        var center = cityCenters[country + "|" + city];
        var r = radiusKm();
        var list = countryEvents();
        if (!center) return list.filter(function (e) { return e.citta === city; });
        if (r <= 0) return list.filter(function (e) { return e.citta === city; });
        return list.filter(function (e) { return haversine(center.lat, center.lng, e.lat, e.lng) <= r; })
            .sort(function (a, b) { return haversine(center.lat, center.lng, a.lat, a.lng) - haversine(center.lat, center.lng, b.lat, b.lng); });
    }

    // Ordinamento "eventi principali": sponsorizzati, poi festival, poi data piu' vicina
    function importanceSort(list) {
        var rank = { festival: 3, showcase: 2, djset: 1 };
        return list.slice().sort(function (a, b) {
            if (!!b.sponsorizzato - !!a.sponsorizzato) return (!!b.sponsorizzato) - (!!a.sponsorizzato);
            var ra = rank[a.tipo] || 0, rb = rank[b.tipo] || 0;
            if (rb - ra) return rb - ra;
            return (a.data + a.ora).localeCompare(b.data + b.ora);
        });
    }

    function currentDataset() {
        if (level === "search") return searchResults;
        if (level === "vicino") return nearEvents();
        if (level === "zona") return zonaEvents();
        if (level === "paese") return importanceSort(countryEvents());
        // europa: eventi in evidenza (sponsorizzati / prossimi) tra i filtri base
        return importanceSort(applyBaseFilters(ALL)).slice(0, 12);
    }

    /* ---------- MARKER ---------- */
    function drawMarkers(evs) {
        cluster.clearLayers();
        evs.forEach(function (ev) {
            // Salta eventi senza coordinate valide: L.marker([null,null]) lancerebbe
            // un errore e bloccherebbe lo zoom del paese.
            if (!hasCoords(ev)) return;
            cluster.addLayer(markerFor(ev));
        });
    }
    function markerFor(ev) {
        var cls = ev.stato === "BURIED" ? "dpa-pin buried" : "dpa-pin live genre-" + genreFamily(ev.genere);
        if (ev.sponsorizzato) cls += " spon";
        var icon = L.divIcon({ className: "dpa-pin-wrap", html: '<span class="' + cls + '"></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
        var m = L.marker([ev.lat, ev.lng], { icon: icon });
        m.bindPopup(popupHtml(ev), { className: "dpa-popup", minWidth: 210 });
        m.on("popupopen", function (e) {
            // Aggancia il click SOLO al bottone del popup appena aperto (non al primo del DOM)
            var el = (e.popup && e.popup.getElement) ? e.popup.getElement() : null;
            var b = el ? el.querySelector(".popup-detail") : null;
            if (b && !b._dpaBound) { b._dpaBound = true; b.addEventListener("click", function () { focusEvent(ev, false); }); }
        });
        return m;
    }
    function pt(e) { return [e.lat, e.lng]; }
    // Solo eventi con coordinate valide (per fitBounds senza errori)
    function ptsOf(evs) {
        return evs.filter(hasCoords).map(pt);
    }

    /* ---------- FALLBACK SENZA CONFINI: un pin cliccabile per nazione ----------
       Se i confini GeoJSON non caricano (CDN giù o bloccata dalla rete/adblocker),
       mostriamo comunque un pin per ogni nazione (calcolato dai dati eventi):
       cliccandolo si entra nella nazione, esattamente come cliccare il paese. */
    function removeFallbackPins() {
        if (fallbackPins && map.hasLayer(fallbackPins)) map.removeLayer(fallbackPins);
        fallbackPins = null;
    }
    function drawCountryPins() {
        removeFallbackPins();
        var acc = {};
        applyBaseFilters(ALL).forEach(function (e) {
            if (!hasCoords(e) || !e.paese) return;
            var a = acc[e.paese] || (acc[e.paese] = { lat: 0, lng: 0, n: 0 });
            a.lat += e.lat; a.lng += e.lng; a.n++;
        });
        fallbackPins = L.layerGroup();
        Object.keys(acc).forEach(function (p) {
            var a = acc[p];
            var icon = L.divIcon({ className: "dpa-cluster-wrap", html: '<div class="dpa-cluster">' + a.n + "</div>", iconSize: [40, 40] });
            var m = L.marker([a.lat / a.n, a.lng / a.n], { icon: icon });
            m.bindTooltip(esc(p) + " &middot; " + a.n + " eventi", { className: "dpa-country-tip", direction: "top" });
            m.on("click", function () { selectCountry(p, countryBounds[p]); });
            fallbackPins.addLayer(m);
        });
        fallbackPins.addTo(map);
    }

    /* ---------- VICINO A TE (geolocalizzazione) ---------- */
    function nearEvents() {
        if (!userPos) return [];
        var list = applyBaseFilters(ALL).filter(hasCoords);
        list.forEach(function (e) { e._dist = haversine(userPos.lat, userPos.lng, e.lat, e.lng); });
        list.sort(function (a, b) { return a._dist - b._dist; });
        var near = list.filter(function (e) { return e._dist <= 150; });   // entro 150 km
        return near.length >= 6 ? near : list.slice(0, 20);                // altrimenti i 20 piu' vicini
    }
    function goNearMe() {
        if (!userPos) return;
        level = "vicino"; country = ""; city = ""; focusedEvent = false;
        setSel("f-paese", ""); setSel("f-citta", "");
        clearCircle(); removeFallbackPins();
        if (bordersOk && countriesLayer && map.hasLayer(countriesLayer)) map.removeLayer(countriesLayer);
        if (!map.hasLayer(cluster)) map.addLayer(cluster);
        var evs = nearEvents();
        drawMarkers(evs);
        var vp = ptsOf(evs);
        if (vp.length) map.flyToBounds(vp, { maxZoom: 11, padding: [40, 40] });
        else map.flyTo([userPos.lat, userPos.lng], 8);
        updateZonaControls(); updateBreadcrumb(); renderList();
    }
    function maybeGeolocate() {
        if (!navigator.geolocation) return;
        var pref = null; try { pref = localStorage.getItem("dpa_geo"); } catch (e) {}
        if (pref === "denied") return;   // ha gia' rifiutato: niente popup automatico (resta il pulsante)
        navigator.geolocation.getCurrentPosition(function (pos) {
            try { localStorage.setItem("dpa_geo", "granted"); } catch (e) {}
            userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            goNearMe();
        }, function () {
            try { localStorage.setItem("dpa_geo", "denied"); } catch (e) {}
        }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
    }
    function requestGeoNow() {
        if (userPos) { goNearMe(); return; }
        if (!navigator.geolocation) { alert("Geolocalizzazione non disponibile nel tuo browser."); return; }
        navigator.geolocation.getCurrentPosition(function (pos) {
            try { localStorage.setItem("dpa_geo", "granted"); } catch (e) {}
            userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            goNearMe();
        }, function () {
            alert("Non riesco a ottenere la posizione. Controlla i permessi di localizzazione del browser.");
        }, { enableHighAccuracy: false, timeout: 8000 });
    }

    /* ---------- LISTA ---------- */
    function renderList() {
        var list = currentDataset();
        var hint = document.getElementById("listHint");
        var title = document.getElementById("listTitle");
        if (level === "zona") { if (title) title.textContent = "Vicino a " + city; if (hint) hint.textContent = radiusKm() > 0 ? "entro " + radiusKm() + " km" : "in citta'"; }
        else if (level === "paese") { if (title) title.textContent = "Eventi principali"; if (hint) hint.textContent = country; }
        else if (level === "search") { if (title) title.textContent = "Risultati"; if (hint) hint.textContent = (val("q-search") || ""); }
        else if (level === "vicino") { if (title) title.textContent = "Vicino a te"; if (hint) hint.textContent = "eventi più vicini a te"; }
        else { if (title) title.textContent = "In evidenza"; if (hint) hint.textContent = "scegli un paese sulla mappa"; }

        var countEl = document.getElementById("listCount");
        if (countEl) countEl.textContent = list.length + (list.length === 1 ? " evento" : " eventi");

        var cont = document.getElementById("eventsList");
        if (!cont) return;
        if (!list.length) {
            cont.innerHTML = '<p class="empty">' + (level === "europa"
                ? "Clicca un paese sulla mappa per esplorare i suoi eventi."
                : "Nessun evento con questi filtri.") + "</p>";
            return;
        }
        cont.innerHTML = list.map(cardHtml).join("");
        cont.querySelectorAll("[data-id]").forEach(function (el) {
            el.addEventListener("click", function () {
                var ev = byId(el.getAttribute("data-id"));
                if (!ev) return;
                focusEvent(ev, true);
            });
        });
    }

    /* ---------- CONTROLLI ZONA (citta' + raggio) ---------- */
    function updateZonaControls() {
        var zc = document.getElementById("zonaControls");
        if (zc) zc.style.display = (level === "europa" || level === "vicino") ? "none" : "flex";
        var rl = document.getElementById("raggioVal");
        if (rl) rl.textContent = radiusKm() > 0 ? radiusKm() + " km" : "illimitato";
    }

    function updateCittaOptions(paese) {
        var src = paese ? ALL.filter(function (e) { return e.paese === paese; }) : ALL;
        var vals = uniq(src.map(function (e) { return e.citta; })).sort(function (a, b) { return a.localeCompare(b); });
        var sel = document.getElementById("f-citta");
        if (!sel) return;
        sel.innerHTML = '<option value="">Tutte</option>' + vals.map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + "</option>"; }).join("");
    }

    /* ---------- BREADCRUMB ---------- */
    function updateBreadcrumb() {
        var bc = document.getElementById("breadcrumb");
        if (!bc) return;
        var html = '<button class="crumb crumb-root" data-level="europa">Europa</button>';
        if (level === "vicino") html += '<span class="crumb-sep">/</span><button class="crumb" data-level="vicino">Vicino a te</button>';
        if (country) html += '<span class="crumb-sep">/</span><button class="crumb" data-level="paese">' + esc(country) + "</button>";
        if (city) html += '<span class="crumb-sep">/</span><button class="crumb" data-level="zona">' + esc(city) + "</button>";
        bc.innerHTML = html;
        bc.querySelectorAll(".crumb").forEach(function (c) {
            c.addEventListener("click", function () {
                var lvl = c.getAttribute("data-level");
                if (lvl === "europa") goEurope();
                else if (lvl === "vicino") goNearMe();
                else if (lvl === "paese") selectCountry(country, countryBounds[country]);
            });
        });
        updateBackButton();
    }

    // Tasto "Indietro" sovrapposto alla mappa: sale di un livello
    function updateBackButton() {
        var bb = document.getElementById("mapBack");
        if (!bb) return;
        if (level === "europa" && !focusedEvent) { bb.style.display = "none"; return; }
        bb.style.display = "block";
        var label;
        if (focusedEvent) label = (level === "zona" ? city : (level === "paese" ? country : "Europa"));
        else label = (level === "zona" ? country : "Europa");
        bb.innerHTML = "&larr; " + esc(label);
    }
    // Sale di un livello: evento aperto (zoom) -> nazione/zona -> Europa
    function goBack() {
        if (focusedEvent) {
            focusedEvent = false;
            toggleDetail(false);
            if (level === "zona") {
                if (searchCircle) { try { map.flyToBounds(searchCircle.getBounds(), { padding: [40, 40] }); } catch (e) {} }
                else selectCity(city);
            } else if (level === "paese") {
                if (countryBounds[country]) map.flyToBounds(countryBounds[country], { maxZoom: 7, padding: [30, 30] });
            } else {
                map.flyToBounds(EUROPE_BOUNDS);
            }
            updateBackButton();
            return;
        }
        if (level === "zona") selectCountry(country, countryBounds[country]);
        else goEurope();
    }

    /* ---------- CARD / POPUP / SCHEDA ---------- */
    function cardHtml(ev) {
        var badge = ev.stato === "BURIED" ? "status-buried" : "status-live";
        var price = ev.gratuito ? "GRATIS" : (ev.prezzo ? "da " + ev.prezzo + " &euro;" : "");
        var tags = '<span class="tag">' + esc(ev.tipo) + "</span>" +
            (ev.genere || []).slice(0, 2).map(function (g) { return '<span class="tag">' + esc(g) + "</span>"; }).join("") +
            (ev.sponsorizzato ? '<span class="tag tag-spon">Sponsor</span>' : "");
        return '<article class="ev-card genre-' + genreFamily(ev.genere) + '" data-id="' + ev.id + '">' +
            '<div class="ev-card-top"><span class="ev-date">' + fmtDate(ev.data) + "</span>" +
            '<span class="status-badge ' + badge + '">' + ev.stato + "</span></div>" +
            '<h3 class="ev-name">' + esc(ev.nome) + "</h3>" +
            '<p class="ev-place">' + esc(ev.locale) + ", " + esc(ev.citta) + ", " + esc(ev.paese) + "</p>" +
            '<div class="ev-tags genre-color-tags">' + tags + "</div>" +
            (price ? '<div class="ev-foot">' + price + "</div>" : "") +
            '<div class="ev-provider">via ' + fonteLabel(ev.fonte) + "</div></article>";
    }
    function popupHtml(ev) {
        var price = ev.gratuito ? "GRATIS" : (ev.prezzo ? "da " + ev.prezzo + " &euro;" : "");
        return '<div class="popup-card">' +
            '<span class="status-badge ' + (ev.stato === "BURIED" ? "status-buried" : "status-live") + '">' + ev.stato + "</span>" +
            "<h4>" + esc(ev.nome) + "</h4><p>" + fmtDate(ev.data) + " &middot; " + esc(ev.citta) + "</p>" +
            "<p>" + esc(ev.locale) + (price ? " &middot; " + price : "") + "</p>" +
            '<p class="popup-provider">via ' + fonteLabel(ev.fonte) + "</p>" +
            '<button class="popup-detail">Dettagli &rarr;</button></div>';
    }
    // Apre un evento: se si è a livello Europa entra prima nel paese, poi
    // (opzionale) zooma sul punto e mostra la scheda. Così il tasto Indietro
    // riporta: evento -> nazione -> Europa.
    function focusEvent(ev, doZoom) {
        if (!ev) return;
        if (level === "europa" && ev.paese) {
            // entra nella nazione (con o senza confini: selectCountry usa i punti evento come fallback)
            selectCountry(ev.paese, countryBounds[ev.paese]);
        }
        if (doZoom && hasCoords(ev)) {
            map.setView([ev.lat, ev.lng], 13);
        }
        focusedEvent = true;
        openDetail(ev.id);
        updateBackButton();
    }
    function openDetail(id) {
        var ev = byId(id); if (!ev) return;
        var price = ev.gratuito ? "Ingresso gratuito" : (ev.prezzo ? "da " + ev.prezzo + " &euro;" : "n/d");
        var ticketLinks = ticketOptions(ev);
        var providers = uniq(ticketLinks.map(function (item) { return fonteLabel(item.fonte); }));
        var rows = [
            ["Data", fmtDate(ev.data) + (ev.ora ? " &middot; " + ev.ora : "")],
            ["Luogo", esc(ev.locale)], ["Indirizzo", esc(ev.indirizzo || "n/d")],
            ["Citta'", esc(ev.citta) + ", " + esc(ev.regione || "") + " (" + esc(ev.paese) + ")"],
            ["Artisti", (ev.artisti || []).map(esc).join(", ") || "n/d"],
            ["Genere", (ev.genere || []).map(esc).join(", ")], ["Tipologia", esc(ev.tipo)],
            ["Prezzo", price], ["Fonte", providers.length ? providers.join(", ") : fonteLabel(ev.fonte)]
        ];
        var biglietti = ticketLinks.length ? '<div class="detail-ticket-choices"><h3>Scegli dove acquistare</h3>' +
            ticketLinks.map(function (item) {
                var extra = item.gratuito ? " - Gratis" : (item.prezzo != null ? " - da " + esc(item.prezzo) + " €" : "");
                return '<a class="btn detail-btn" href="' + esc(item.url) + '" target="_blank" rel="noopener sponsored">' +
                    "Biglietti su " + fonteLabel(item.fonte) + extra + "</a>";
            }).join("") + "</div>" : "";
        document.getElementById("detailBody").innerHTML =
            '<div class="detail-head"><span class="status-badge ' + (ev.stato === "BURIED" ? "status-buried" : "status-live") + '">' + ev.stato + "</span>" +
            (ev.sponsorizzato ? '<span class="tag tag-spon">Contenuto sponsorizzato</span>' : "") + "</div>" +
            '<h2 class="detail-title">' + esc(ev.nome) + "</h2>" +
            '<p class="detail-desc">' + esc(ev.descrizione || "") + "</p>" +
            '<table class="detail-table"><tbody>' + rows.map(function (r) { return "<tr><th>" + r[0] + "</th><td>" + r[1] + "</td></tr>"; }).join("") + "</tbody></table>" + biglietti;
        toggleDetail(true);
    }
    function toggleDetail(show) {
        var d = document.getElementById("eventDetail"), o = document.getElementById("detailOverlay");
        if (!d || !o) return;
        d.classList.toggle("open", show); o.classList.toggle("open", show);
        d.setAttribute("aria-hidden", show ? "false" : "true");
    }

    /* ---------- CHATBOT GUIDATO ---------- */
    var chatState = { genere: "", paese: "" };
    function buildChatbot() { renderChatStep(0); }
    function renderChatStep(step) {
        var body = document.getElementById("chatbotBody"); if (!body) return;
        if (step === 0) {
            var generi = ["rock", "rap", "electronic"];
            body.innerHTML = '<p class="bot-msg">Che musica cerchi?</p><div class="bot-opts">' +
                generi.map(function (g) { return '<button class="bot-opt" data-g="' + esc(g) + '">' + esc(genreFamilyLabel(g)) + "</button>"; }).join("") +
                '<button class="bot-opt" data-g="">Qualsiasi</button></div>';
            body.querySelectorAll(".bot-opt").forEach(function (b) { b.addEventListener("click", function () { chatState.genere = b.getAttribute("data-g"); renderChatStep(1); }); });
        } else if (step === 1) {
            var paesi = uniq(ALL.map(function (e) { return e.paese; })).sort();
            body.innerHTML = '<p class="bot-msg">In che paese?</p><div class="bot-opts">' +
                paesi.map(function (p) { return '<button class="bot-opt" data-p="' + esc(p) + '">' + esc(p) + "</button>"; }).join("") +
                '<button class="bot-opt" data-p="">Ovunque</button></div>';
            body.querySelectorAll(".bot-opt").forEach(function (b) { b.addEventListener("click", function () { chatState.paese = b.getAttribute("data-p"); applyChat(); }); });
        }
    }
    function applyChat() {
        setSel("f-genere", chatState.genere);
        if (chatState.paese) selectCountry(chatState.paese, countryBounds[chatState.paese]);
        else goEurope();
        var n = currentDataset().length;
        var body = document.getElementById("chatbotBody");
        body.innerHTML = '<p class="bot-msg">Ho trovato <strong>' + n + "</strong> eventi" +
            (chatState.genere ? " di " + esc(chatState.genere) : "") + (chatState.paese ? " in " + esc(chatState.paese) : " in Europa") + ".</p>" +
            '<button class="bot-opt" id="botRestart">Ricomincia</button>';
        var r = document.getElementById("botRestart");
        if (r) r.addEventListener("click", function () { chatState = { genere: "", paese: "" }; renderChatStep(0); });
    }

    /* ---------- UI WIRING ---------- */
    function wireUI() {
        var filtersToggle = document.getElementById("filtersToggle");
        var filtersForm = document.getElementById("mapFilters");
        if (filtersToggle && filtersForm) {
            filtersToggle.addEventListener("click", function () {
                var open = filtersForm.classList.toggle("open");
                filtersToggle.setAttribute("aria-expanded", open ? "true" : "false");
                filtersToggle.innerHTML = open ? "Chiudi filtri &#9652;" : "Filtri &#9662;";
            });
        }

        // Filtri base -> ridisegna il livello corrente
        ["f-genere", "f-tipo", "f-data", "f-data-fine", "f-gratis"].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener("change", function () {
                if (id === "f-genere") quickFilter = el.value || "all";
                if (id === "f-tipo" && quickFilter === "festival") quickFilter = "all";
                syncQuickFilters();
                refreshCurrent();
            });
        });
        document.querySelectorAll("[data-quick-filter]").forEach(function (button) {
            button.addEventListener("click", function () {
                quickFilter = button.getAttribute("data-quick-filter") || "all";
                if (quickFilter === "festival" || quickFilter === "all") {
                    setSel("f-genere", "");
                    setSel("f-tipo", "");
                } else {
                    setSel("f-genere", quickFilter);
                    setSel("f-tipo", "");
                }
                syncQuickFilters();
                refreshCurrent();
            });
        });
        // Date: apri il calendarietto nativo cliccando sul campo (niente scrittura a mano)
        ["f-data", "f-data-fine"].forEach(function (id) {
            var el = document.getElementById(id);
            if (el && typeof el.showPicker === "function") {
                var openCal = function () { try { el.showPicker(); } catch (e) {} };
                el.addEventListener("focus", openCal);
                el.addEventListener("click", openCal);
            }
        });
        // Paese dal menu a tendina (alternativa al click sulla mappa)
        var fp = document.getElementById("f-paese");
        if (fp) fp.addEventListener("change", function () { if (fp.value) selectCountry(fp.value, countryBounds[fp.value]); else goEurope(); });
        // Citta'
        var fc = document.getElementById("f-citta");
        if (fc) fc.addEventListener("change", function () { selectCity(fc.value); });
        // Raggio km
        var fr = document.getElementById("f-raggio");
        if (fr) fr.addEventListener("input", function () {
            updateZonaControls();
            if (level === "zona") selectCity(city);
        });

        // Barra di ricerca: artista / band / genere (ricerca globale su tutta Europa)
        var qs = document.getElementById("q-search");
        if (qs) qs.addEventListener("input", doSearch);
        var qc = document.getElementById("q-clear");
        if (qc) qc.addEventListener("click", function () { setSel("q-search", ""); goEurope(); });

        var reset = document.getElementById("btnReset");
        if (reset) reset.addEventListener("click", function () {
            ["f-genere", "f-tipo", "f-data", "f-data-fine", "q-search"].forEach(function (id) { setSel(id, ""); });
            var g = document.getElementById("f-gratis");
            if (g) g.checked = false;
            var r = document.getElementById("f-raggio"); if (r) r.value = 0;
            quickFilter = "all";
            syncQuickFilters();
            goEurope();
        });

        // Tendina eventi: apri/chiudi con un click
        var toggle = document.getElementById("listToggle");
        var reopen = document.getElementById("listReopen");
        var layout = document.querySelector(".map-layout");
        function setCollapsed(c) {
            layout.classList.toggle("list-collapsed", c);
            if (reopen) reopen.style.display = c ? "block" : "none";
            setTimeout(function () { if (map) map.invalidateSize(); }, 260);
        }
        if (toggle && layout) toggle.addEventListener("click", function () { setCollapsed(!layout.classList.contains("list-collapsed")); });
        if (reopen && layout) reopen.addEventListener("click", function () { setCollapsed(false); });

        // Tasto Indietro sulla mappa
        var back = document.getElementById("mapBack");
        if (back) back.addEventListener("click", goBack);

        // Pulsante "Vicino a me" (geolocalizzazione) nella toolbar
        var tbInner = document.querySelector(".map-toolbar-inner");
        if (tbInner && !document.getElementById("btnNearMe")) {
            var nm = document.createElement("button");
            nm.id = "btnNearMe"; nm.type = "button"; nm.className = "view-btn";
            nm.innerHTML = "&#128205; Vicino a me";
            nm.title = "Mostra gli eventi vicino a te";
            nm.addEventListener("click", requestGeoNow);
            tbInner.appendChild(nm);
        }

        // Vista Mappa/Elenco/Calendario
        document.querySelectorAll(".view-btn").forEach(function (b) {
            b.addEventListener("click", function () {
                document.querySelectorAll(".view-btn").forEach(function (x) { x.classList.remove("active"); });
                b.classList.add("active");
                var v = b.getAttribute("data-view");
                var lay = document.querySelector(".map-layout");
                lay.classList.remove("view-mappa", "view-elenco", "view-calendario");
                lay.classList.add("view-" + v);
                if (v === "mappa") setTimeout(function () { map.invalidateSize(); }, 50);
                renderList();
            });
        });
        var lay0 = document.querySelector(".map-layout"); if (lay0) lay0.classList.add("view-mappa");

        var dc = document.getElementById("detailClose"), ov = document.getElementById("detailOverlay");
        if (dc) dc.addEventListener("click", function () { toggleDetail(false); });
        if (ov) ov.addEventListener("click", function () { toggleDetail(false); });
        document.addEventListener("keydown", function (e) { if (e.key === "Escape") toggleDetail(false); });

        var fab = document.getElementById("chatbotFab"), panel = document.getElementById("chatbotPanel"), cc = document.getElementById("chatbotClose");
        if (fab && panel) fab.addEventListener("click", function () { var o = panel.classList.toggle("open"); panel.setAttribute("aria-hidden", o ? "false" : "true"); });
        if (cc && panel) cc.addEventListener("click", function () { panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true"); });
    }

    function syncQuickFilters() {
        document.querySelectorAll("[data-quick-filter]").forEach(function (button) {
            var active = button.getAttribute("data-quick-filter") === quickFilter;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });
    }

    function refreshCurrent() {
        if (level === "search") { doSearch(); return; }
        if (level === "vicino") { drawMarkers(nearEvents()); renderList(); }
        else if (level === "zona") selectCity(city);
        else if (level === "paese") { drawMarkers(countryEvents()); renderList(); }
        else { renderList(); if (!bordersOk) drawCountryPins(); }
    }

    function doSearch() {
        var q = (val("q-search") || "").trim();
        if (q.length < 2) { if (!q) goEurope(); return; }
        level = "search"; country = ""; city = ""; focusedEvent = false;
        setSel("f-paese", ""); setSel("f-citta", "");
        clearCircle();
        searchResults = applyBaseFilters(ALL);
        if (bordersOk && countriesLayer && map.hasLayer(countriesLayer)) map.removeLayer(countriesLayer);
        if (!map.hasLayer(cluster)) map.addLayer(cluster);
        drawMarkers(searchResults);
        updateZonaControls();
        updateBreadcrumb();
        renderList();
        var vsp = ptsOf(searchResults); if (vsp.length) { try { map.flyToBounds(vsp, { maxZoom: 10, padding: [40, 40] }); } catch (e) {} }
    }

    function populateFilters() {
        fillSelect("f-paese", uniq(ALL.map(function (e) { return e.paese; })));
        fillSelect("f-tipo", uniq(ALL.map(function (e) { return e.tipo; })));
    }
    function fillSelect(id, values) {
        var sel = document.getElementById(id); if (!sel) return;
        var first = sel.querySelector("option");
        sel.innerHTML = ""; if (first) sel.appendChild(first);
        values.sort(function (a, b) { return String(a).localeCompare(String(b)); });
        values.forEach(function (v) { var o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); });
    }

    /* ---------- UTIL ---------- */
    function clearCircle() { if (searchCircle) { map.removeLayer(searchCircle); searchCircle = null; } }
    function byId(id) { for (var i = 0; i < ALL.length; i++) if (ALL[i].id === id || String(ALL[i].id) === String(id)) return ALL[i]; return null; }
    function setSel(id, v) { var e = document.getElementById(id); if (e) e.value = v; }
    function uniq(a) { var s = {}, o = []; a.forEach(function (x) { if (x != null && !s[x]) { s[x] = 1; o.push(x); } }); return o; }
    function flatten(a) { return a.reduce(function (x, y) { return x.concat(y); }, []); }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
    function ticketOptions(ev) {
        var list = Array.isArray(ev.biglietti) ? ev.biglietti.slice() : [];
        if (ev.biglietti_url) list.push({ fonte: ev.fonte, url: ev.biglietti_url, prezzo: ev.prezzo, gratuito: ev.gratuito });
        var seen = {};
        return list.filter(function (item) {
            if (!item || !item.url) return false;
            var url = String(item.url).trim();
            if (!/^https?:\/\//i.test(url) || seen[url]) return false;
            seen[url] = true;
            item.url = url;
            return true;
        });
    }
    // Nome "bello" del provider/fonte, per l'attribuzione su ogni evento
    function fonteLabel(f) {
        var m = { ticketmaster: "Ticketmaster", dice: "DICE", skiddle: "Skiddle", ra: "Resident Advisor", bandsintown: "Bandsintown", community: "Community", demo: "Demo" };
        f = String(f || "").toLowerCase();
        return m[f] || (f ? esc(f) : "n/d");
    }
    function fmtDate(iso) { if (!iso) return ""; var p = iso.split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso; }
    function haversine(la1, lo1, la2, lo2) {
        var R = 6371, dLa = rad(la2 - la1), dLo = rad(lo2 - lo1);
        var a = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    function rad(d) { return d * Math.PI / 180; }
})();
