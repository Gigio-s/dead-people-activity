(function () {
    'use strict';

    const LANGS = ['it', 'en', 'es', 'ca', 'de', 'fr'];
    const COPY = {
        it: { exit:'ESCI', intro_title:'SEI UBRIACO?', intro_text:'Perfetto. Niente mappe impossibili: tre tocchi e ti diciamo dove andare.', start:'SONO ABBASTANZA LUCIDO', safety:'Non guidare. Se devi spostarti, usa i mezzi, cammina o chiama qualcuno.', step_1:'1 DI 2', where:'DOVE CAZZO SEI?', use_location:'USA LA MIA POSIZIONE', location_note:'Resta sul tuo telefono. Non la salviamo.', or:'OPPURE', city_label:'SCRIVI LA CITTÀ', city_placeholder:'Barcelona, Milano, Vicenza...', continue:'CONTINUA', step_2:'2 DI 2', what:'CHE VUOI SENTIRE?', genre_any:'QUALSIASI COSA', genre_electronic:'ELETTRONICA', back:'← INDIETRO', mission:'LA TUA MISSIONE', results:'VAI QUI.', change:'CAMBIA', verify:'Orari e disponibilità possono cambiare. Controlla sempre il link ufficiale prima di partire.', error_title:'NON TROVO NIENTE.', error_text:'Prova un altro genere o una città vicina.', try_again:'RIPROVA', locating:'TI STO CERCANDO...', denied:'Non riesco a usare la posizione. Scrivi la città qui sotto.', unknown_city:'Questa città non compare ancora nei nostri eventi. Prova il nome esatto o una città vicina.', loading:'CARICO IL CASINO...', no_events:'Nessun evento compatibile nelle vicinanze nei prossimi giorni.', tonight:'STASERA', tomorrow:'DOMANI', official:'INFO / BIGLIETTI', take_me:'PORTAMI LÌ', free:'GRATIS', near:'vicino a', found:'eventi trovati', expanded:'Niente nelle prossime 48 ore: ti mostro i prossimi giorni.' },
        en: { exit:'EXIT', intro_title:'ARE YOU DRUNK?', intro_text:'Perfect. No impossible maps: three taps and we tell you where to go.', start:'I AM LUCID ENOUGH', safety:'Do not drive. Walk, use public transport or call someone.', step_1:'1 OF 2', where:'WHERE THE HELL ARE YOU?', use_location:'USE MY LOCATION', location_note:'It stays on your phone. We do not save it.', or:'OR', city_label:'TYPE YOUR CITY', city_placeholder:'Barcelona, Milan, Vicenza...', continue:'CONTINUE', step_2:'2 OF 2', what:'WHAT DO YOU WANT TO HEAR?', genre_any:'ANYTHING', genre_electronic:'ELECTRONIC', back:'← BACK', mission:'YOUR MISSION', results:'GO HERE.', change:'CHANGE', verify:'Times and availability can change. Always check the official link before leaving.', error_title:'I FOUND NOTHING.', error_text:'Try another genre or a nearby city.', try_again:'TRY AGAIN', locating:'LOOKING FOR YOU...', denied:'I cannot use your location. Type your city below.', unknown_city:'That city is not in our events yet. Try the exact name or a nearby city.', loading:'LOADING THE CHAOS...', no_events:'No matching nearby events in the next few days.', tonight:'TONIGHT', tomorrow:'TOMORROW', official:'INFO / TICKETS', take_me:'TAKE ME THERE', free:'FREE', near:'near', found:'events found', expanded:'Nothing in the next 48 hours: showing the next few days.' },
        es: { exit:'SALIR', intro_title:'¿ESTÁS BORRACHO?', intro_text:'Perfecto. Sin mapas imposibles: tres toques y te decimos adónde ir.', start:'ESTOY BASTANTE LÚCIDO', safety:'No conduzcas. Camina, usa transporte público o llama a alguien.', step_1:'1 DE 2', where:'¿DÓNDE COÑO ESTÁS?', use_location:'USAR MI UBICACIÓN', location_note:'Se queda en tu móvil. No la guardamos.', or:'O', city_label:'ESCRIBE LA CIUDAD', city_placeholder:'Barcelona, Milán, Vicenza...', continue:'CONTINUAR', step_2:'2 DE 2', what:'¿QUÉ QUIERES ESCUCHAR?', genre_any:'CUALQUIER COSA', genre_electronic:'ELECTRÓNICA', back:'← ATRÁS', mission:'TU MISIÓN', results:'VE AQUÍ.', change:'CAMBIAR', verify:'Los horarios y la disponibilidad pueden cambiar. Comprueba siempre el enlace oficial.', error_title:'NO ENCUENTRO NADA.', error_text:'Prueba otro género o una ciudad cercana.', try_again:'REINTENTAR', locating:'TE ESTOY BUSCANDO...', denied:'No puedo usar tu ubicación. Escribe la ciudad.', unknown_city:'Esa ciudad aún no aparece en nuestros eventos. Prueba el nombre exacto o una ciudad cercana.', loading:'CARGANDO EL CAOS...', no_events:'No hay eventos compatibles cerca en los próximos días.', tonight:'ESTA NOCHE', tomorrow:'MAÑANA', official:'INFO / ENTRADAS', take_me:'LLÉVAME', free:'GRATIS', near:'cerca de', found:'eventos encontrados', expanded:'Nada en las próximas 48 horas: te enseño los próximos días.' },
        ca: { exit:'SORTIR', intro_title:'VAS PET?', intro_text:'Perfecte. Sense mapes impossibles: tres tocs i et diem on anar.', start:'ESTIC PROU LÚCID', safety:'No condueixis. Camina, usa transport públic o truca a algú.', step_1:'1 DE 2', where:'ON COLLONS ETS?', use_location:'USA LA MEVA UBICACIÓ', location_note:'Es queda al teu mòbil. No la desem.', or:'O', city_label:'ESCRIU LA CIUTAT', city_placeholder:'Barcelona, Milà, Vicenza...', continue:'CONTINUA', step_2:'2 DE 2', what:'QUÈ VOLS ESCOLTAR?', genre_any:'QUALSEVOL COSA', genre_electronic:'ELECTRÒNICA', back:'← ENRERE', mission:'LA TEVA MISSIÓ', results:'VES AQUÍ.', change:'CANVIA', verify:'Els horaris i la disponibilitat poden canviar. Comprova sempre l’enllaç oficial.', error_title:'NO TROBO RES.', error_text:'Prova un altre gènere o una ciutat propera.', try_again:'TORNA-HI', locating:'T’ESTIC BUSCANT...', denied:'No puc usar la ubicació. Escriu la ciutat.', unknown_city:'Aquesta ciutat encara no apareix als nostres esdeveniments. Prova el nom exacte o una ciutat propera.', loading:'CARREGANT EL CAOS...', no_events:'No hi ha esdeveniments compatibles a prop els pròxims dies.', tonight:'AQUESTA NIT', tomorrow:'DEMÀ', official:'INFO / ENTRADES', take_me:'PORTA-M’HI', free:'GRATIS', near:'a prop de', found:'esdeveniments trobats', expanded:'Res en les pròximes 48 hores: et mostro els pròxims dies.' },
        de: { exit:'RAUS', intro_title:'BIST DU BETRUNKEN?', intro_text:'Perfekt. Keine komplizierte Karte: drei Klicks und du weißt, wohin.', start:'ICH BIN NOCH KLAR GENUG', safety:'Fahr nicht selbst. Geh zu Fuß, nimm den Nahverkehr oder ruf jemanden an.', step_1:'1 VON 2', where:'WO ZUM TEUFEL BIST DU?', use_location:'MEINEN STANDORT NUTZEN', location_note:'Bleibt auf deinem Handy. Wir speichern ihn nicht.', or:'ODER', city_label:'STADT EINGEBEN', city_placeholder:'Barcelona, Mailand, Vicenza...', continue:'WEITER', step_2:'2 VON 2', what:'WAS WILLST DU HÖREN?', genre_any:'EGAL WAS', genre_electronic:'ELEKTRONISCH', back:'← ZURÜCK', mission:'DEINE MISSION', results:'GEH HIERHIN.', change:'ÄNDERN', verify:'Zeiten und Verfügbarkeit können sich ändern. Prüfe vor dem Losgehen den offiziellen Link.', error_title:'NICHTS GEFUNDEN.', error_text:'Versuch ein anderes Genre oder eine Stadt in der Nähe.', try_again:'NOCHMAL', locating:'ICH SUCHE DICH...', denied:'Ich kann deinen Standort nicht nutzen. Gib unten deine Stadt ein.', unknown_city:'Diese Stadt ist noch nicht in unseren Events. Versuch den exakten Namen oder eine Stadt in der Nähe.', loading:'CHAOS WIRD GELADEN...', no_events:'Keine passenden Events in der Nähe in den nächsten Tagen.', tonight:'HEUTE NACHT', tomorrow:'MORGEN', official:'INFO / TICKETS', take_me:'BRING MICH HIN', free:'KOSTENLOS', near:'nahe', found:'Events gefunden', expanded:'Nichts in den nächsten 48 Stunden: hier sind die nächsten Tage.' },
        fr: { exit:'SORTIR', intro_title:'TU ES BOURRÉ ?', intro_text:'Parfait. Pas de carte impossible : trois clics et on te dit où aller.', start:'JE SUIS ASSEZ LUCIDE', safety:'Ne conduis pas. Marche, prends les transports ou appelle quelqu’un.', step_1:'1 SUR 2', where:'T’ES OÙ BORDEL ?', use_location:'UTILISER MA POSITION', location_note:'Elle reste sur ton téléphone. Nous ne la sauvegardons pas.', or:'OU', city_label:'ÉCRIS LA VILLE', city_placeholder:'Barcelone, Milan, Vicenza...', continue:'CONTINUER', step_2:'2 SUR 2', what:'TU VEUX ÉCOUTER QUOI ?', genre_any:'N’IMPORTE QUOI', genre_electronic:'ÉLECTRONIQUE', back:'← RETOUR', mission:'TA MISSION', results:'VA ICI.', change:'CHANGER', verify:'Les horaires et disponibilités peuvent changer. Vérifie toujours le lien officiel avant de partir.', error_title:'JE NE TROUVE RIEN.', error_text:'Essaie un autre genre ou une ville proche.', try_again:'RÉESSAYER', locating:'JE TE CHERCHE...', denied:'Je ne peux pas utiliser ta position. Écris ta ville ci-dessous.', unknown_city:'Cette ville n’apparaît pas encore dans nos événements. Essaie le nom exact ou une ville proche.', loading:'JE CHARGE LE CHAOS...', no_events:'Aucun événement compatible à proximité dans les prochains jours.', tonight:'CE SOIR', tomorrow:'DEMAIN', official:'INFOS / BILLETS', take_me:'EMMÈNE-MOI', free:'GRATUIT', near:'près de', found:'événements trouvés', expanded:'Rien dans les prochaines 48 heures : voici les prochains jours.' }
    };
    Object.assign(COPY.it, { start: 'CI SONO' });
    Object.assign(COPY.en, { start: 'I’M IN' });
    Object.assign(COPY.es, { start: 'VAMOS' });
    Object.assign(COPY.ca, { start: 'SOM-HI' });
    Object.assign(COPY.de, { start: 'LOS' });
    Object.assign(COPY.fr, { start: 'C’EST PARTI' });

    const state = { events: [], cities: [], origin: null, originLabel: '', genre: 'all', lang: language() };
    const $ = selector => document.querySelector(selector);
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const t = key => (COPY[state.lang] && COPY[state.lang][key]) || COPY.it[key] || key;

    function language() {
        const query = new URLSearchParams(location.search).get('lang');
        if (LANGS.includes(query)) return query;
        try { const saved = localStorage.getItem('dpa_lang'); if (LANGS.includes(saved)) return saved; } catch (_) {}
        const browser = String(navigator.language || 'it').slice(0, 2).toLowerCase();
        return LANGS.includes(browser) ? browser : 'en';
    }

    function applyCopy() {
        document.documentElement.lang = state.lang;
        document.querySelectorAll('[data-t]').forEach(node => { node.textContent = t(node.dataset.t); });
        document.querySelectorAll('[data-t-placeholder]').forEach(node => { node.placeholder = t(node.dataset.tPlaceholder); });
    }

    function show(name) {
        document.querySelectorAll('.drunk-screen').forEach(screen => screen.classList.toggle('is-active', screen.dataset.screen === name));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function loadEvents() {
        let response = await fetch('assets/data/drunk-events.json?v=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) response = await fetch('assets/data/events.json?v=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) throw new Error('events');
        const data = await response.json();
        state.events = Array.isArray(data) ? data.filter(event => event && event.data && event.approvazione !== 'rifiutato') : [];
        const grouped = new Map();
        state.events.forEach(event => {
            if (!event.citta || !Number.isFinite(Number(event.lat)) || !Number.isFinite(Number(event.lng))) return;
            const key = normalize(event.citta);
            if (!grouped.has(key)) grouped.set(key, { name: event.citta, points: [] });
            grouped.get(key).points.push([Number(event.lat), Number(event.lng)]);
        });
        state.cities = [...grouped.values()].map(city => ({
            name: city.name,
            lat: median(city.points.map(point => point[0])),
            lng: median(city.points.map(point => point[1]))
        })).sort((a, b) => a.name.localeCompare(b.name));
        $('#cityList').innerHTML = state.cities.map(city => '<option value="' + esc(city.name) + '"></option>').join('');
    }

    function median(values) {
        const sorted = values.filter(Number.isFinite).sort((a,b) => a-b);
        if (!sorted.length) return null;
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }

    function locate() {
        const button = $('[data-action="locate"]');
        const feedback = $('#locationFeedback');
        if (!navigator.geolocation) { feedback.textContent = t('denied'); return; }
        button.disabled = true;
        feedback.textContent = t('locating');
        navigator.geolocation.getCurrentPosition(position => {
            state.origin = { lat: position.coords.latitude, lng: position.coords.longitude };
            state.originLabel = '';
            button.disabled = false;
            feedback.textContent = '';
            show('genre');
        }, () => {
            button.disabled = false;
            feedback.textContent = t('denied');
            $('#cityInput').focus();
        }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 });
    }

    function chooseCity(value) {
        const wanted = normalize(value);
        if (!wanted) return false;
        let city = state.cities.find(item => normalize(item.name) === wanted);
        if (!city) {
            const matches = state.cities.filter(item => normalize(item.name).includes(wanted) || wanted.includes(normalize(item.name)));
            if (matches.length === 1) city = matches[0];
        }
        if (!city) return false;
        state.origin = { lat: city.lat, lng: city.lng };
        state.originLabel = city.name;
        show('genre');
        return true;
    }

    function haversine(a, b) {
        const rad = value => value * Math.PI / 180;
        const earth = 6371;
        const dLat = rad(b.lat - a.lat);
        const dLng = rad(b.lng - a.lng);
        const x = Math.sin(dLat/2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng/2) ** 2;
        return earth * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
    }

    function eventDate(event) {
        const time = /^\d{2}:\d{2}/.test(event.ora || '') ? event.ora.slice(0,5) : '23:59';
        return new Date(event.data + 'T' + time + ':00');
    }

    function genreMatches(event) {
        if (state.genre === 'all') return true;
        const value = normalize([event.tipo, ...(Array.isArray(event.genere) ? event.genere : [event.genere])].join(' '));
        const terms = {
            rock: ['rock', 'grunge', 'psychedelic'], punk: ['punk', 'hardcore', 'oi!'], metal: ['metal', 'doom', 'sludge'],
            electronic: ['electronic', 'electro', 'techno', 'house', 'dance', 'trance', 'jungle', 'drum and bass', 'garage', 'club', 'ambient', 'audiovisual'],
            rap: ['rap', 'hip-hop', 'hip hop', 'trap'], indie: ['indie', 'alternative', 'post-rock', 'shoegaze', 'new wave']
        };
        return (terms[state.genre] || []).some(term => value.includes(term));
    }

    function findEvents() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const candidates = state.events.map(event => {
            const lat = Number(event.lat), lng = Number(event.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || !genreMatches(event)) return null;
            const when = eventDate(event);
            if (when < now) return null;
            return { event, when, distance: haversine(state.origin, { lat, lng }) };
        }).filter(Boolean);
        let expanded = false;
        let matches = candidates.filter(item => item.distance <= 60 && item.when - now <= 48 * 3600000);
        if (!matches.length) {
            expanded = true;
            matches = candidates.filter(item => item.distance <= 100 && item.when - today <= 7 * 86400000);
        }
        matches.sort((a, b) => {
            const dayA = Math.floor((new Date(a.when.getFullYear(), a.when.getMonth(), a.when.getDate()) - today) / 86400000);
            const dayB = Math.floor((new Date(b.when.getFullYear(), b.when.getMonth(), b.when.getDate()) - today) / 86400000);
            return dayA - dayB || a.distance - b.distance || a.when - b.when;
        });
        return { matches: matches.slice(0, 8), expanded };
    }

    function dateLabel(when) {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const day = Math.round((new Date(when.getFullYear(), when.getMonth(), when.getDate()) - start) / 86400000);
        const time = when.toLocaleTimeString(state.lang, { hour: '2-digit', minute: '2-digit' });
        if (day === 0) return t('tonight') + ' · ' + time;
        if (day === 1) return t('tomorrow') + ' · ' + time;
        return when.toLocaleDateString(state.lang, { weekday:'short', day:'numeric', month:'short' }).toUpperCase() + ' · ' + time;
    }

    function renderResults() {
        show('results');
        $('#drunkResults').innerHTML = '<p>' + esc(t('loading')) + '</p>';
        requestAnimationFrame(() => {
            const result = findEvents();
            if (!result.matches.length) { $('#errorMessage').textContent = t('no_events'); show('error'); return; }
            const place = state.originLabel ? ' ' + t('near') + ' ' + state.originLabel : '';
            $('#resultsSummary').textContent = result.matches.length + ' ' + t('found') + place + (result.expanded ? ' · ' + t('expanded') : '');
            $('#drunkResults').innerHTML = result.matches.map((item, index) => card(item, index)).join('');
        });
    }

    function card(item, index) {
        const event = item.event;
        const destination = Number(event.lat) + ',' + Number(event.lng);
        const directions = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(destination) + '&travelmode=walking';
        const official = event.biglietti_url || event.promoter_url || directions;
        const genres = (Array.isArray(event.genere) ? event.genere : [event.genere]).filter(Boolean).slice(0,2).join(' · ');
        const price = event.gratuito ? t('free') : (event.prezzo ? event.prezzo + ' €' : '');
        const meta = [item.distance.toFixed(item.distance < 10 ? 1 : 0) + ' km', price, genres].filter(Boolean).join(' · ');
        return '<article class="drunk-result">' +
            '<span class="drunk-result-rank" aria-hidden="true">' + (index + 1) + '</span>' +
            '<span class="drunk-result-when">' + esc(dateLabel(item.when)) + '</span>' +
            '<h3>' + esc(event.nome) + '</h3>' +
            '<p class="drunk-result-place">' + esc([event.locale, event.citta].filter(Boolean).join(' · ')) + '</p>' +
            '<p class="drunk-result-meta">' + esc(meta) + '</p>' +
            '<div class="drunk-result-actions">' +
                '<a href="' + esc(official) + '" target="_blank" rel="noopener sponsored">' + esc(t('official')) + '</a>' +
                '<a href="' + esc(directions) + '" target="_blank" rel="noopener">' + esc(t('take_me')) + '</a>' +
            '</div></article>';
    }

    document.addEventListener('click', event => {
        const action = event.target.closest('[data-action]');
        if (action) {
            if (action.dataset.action === 'start') show('location');
            if (action.dataset.action === 'locate') locate();
            if (action.dataset.action === 'back-location') show('location');
            if (action.dataset.action === 'restart') { state.origin = null; state.originLabel = ''; show('location'); }
        }
        const genre = event.target.closest('[data-genre]');
        if (genre) { state.genre = genre.dataset.genre; renderResults(); }
    });

    $('#cityForm').addEventListener('submit', event => {
        event.preventDefault();
        if (!chooseCity($('#cityInput').value)) $('#locationFeedback').textContent = t('unknown_city');
        else $('#locationFeedback').textContent = '';
    });

    applyCopy();
    loadEvents().catch(() => { $('#errorMessage').textContent = t('no_events'); show('error'); });
})();
