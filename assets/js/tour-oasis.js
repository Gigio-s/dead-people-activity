(function () {
    'use strict';

    const stops = [
        { city:'Glasgow', venue:'Celtic Park', country:'Scotland', region:'europe', coords:[55.8497,-4.2055], dates:['21 maggio','23 maggio','25 maggio','28 maggio','29 maggio'] },
        { city:'Manchester', venue:'Etihad Stadium', country:'England', region:'europe', coords:[53.4831,-2.2004], dates:['4 giugno','6 giugno','8 giugno','11 giugno','12 giugno','15 giugno','18 giugno','19 giugno','22 giugno','25 giugno','26 giugno'] },
        { city:'Munich', venue:'Allianz Arena', country:'Germany', region:'europe', coords:[48.2188,11.6247], dates:['2 luglio','3 luglio','6 luglio'] },
        { city:'Barcelona', venue:'Estadi Olímpic Lluís Companys', country:'Spain', region:'europe', coords:[41.3648,2.1557], dates:['10 luglio','11 luglio'] },
        { city:'Amsterdam', venue:'Johan Cruijff ArenA', country:'The Netherlands', region:'europe', coords:[52.3143,4.9410], dates:['16 luglio','17 luglio'] },
        { city:'Paris', venue:'Stade de France', country:'France', region:'europe', coords:[48.9245,2.3601], dates:['20 luglio · riprogrammata','23 luglio'] },
        { city:'Rome', venue:'Stadio Olimpico', country:'Italy', region:'europe', coords:[41.9341,12.4547], dates:['26 luglio','29 luglio','30 luglio'] },
        { city:'Boston', venue:'Gillette Stadium', country:'USA', region:'america', coords:[42.0909,-71.2643], dates:['10 agosto','13 agosto','14 agosto'] },
        { city:'Las Vegas', venue:'Allegiant Stadium', country:'USA', region:'america', coords:[36.0909,-115.1833], dates:['20 agosto','21 agosto','24 agosto'] },
        { city:'Slane', venue:'Slane Castle', country:'Ireland', region:'europe', coords:[53.7090,-6.5360], dates:['4 settembre','5 settembre'] },
        { city:'Knebworth', venue:'Knebworth Park', country:'England', region:'europe', coords:[51.8722,-0.2144], dates:['11 settembre','12 settembre','18 settembre','19 settembre','25 settembre','26 settembre'] }
    ];

    let map;
    let markerLayer;
    let routeLayer;
    let currentFilter = 'all';
    const markers = new Map();

    function totalDates(list) { return list.reduce((sum, stop) => sum + stop.dates.length, 0); }

    function markerIcon(index) {
        return L.divIcon({
            className: 'oasis-map-pin-wrap',
            html: '<span class="oasis-map-pin">' + String(index + 1).padStart(2, '0') + '</span>',
            iconSize: [38, 38], iconAnchor: [19, 19]
        });
    }

    function showStop(stop, index, zoom) {
        const panel = document.getElementById('oasis-stop-panel');
        panel.querySelector('.oasis-stop-number').textContent = 'Tappa ' + String(index + 1).padStart(2, '0');
        panel.querySelector('h3').textContent = stop.city;
        panel.querySelector('.oasis-stop-venue').textContent = stop.venue + ' · ' + stop.country;
        panel.querySelector('.oasis-stop-dates').innerHTML = stop.dates.map(date => '<span>' + date + ' 2027</span>').join('');
        document.querySelectorAll('#oasis-date-rail button').forEach((button, buttonIndex) => button.classList.toggle('is-active', buttonIndex === index));
        if (zoom && map) map.flyTo(stop.coords, stop.region === 'america' ? 5 : 6, { duration: 1.2 });
    }

    function visibleStops() { return currentFilter === 'all' ? stops : stops.filter(stop => stop.region === currentFilter); }

    function drawMap() {
        const list = visibleStops();
        markerLayer.clearLayers();
        routeLayer.clearLayers();
        markers.clear();
        list.forEach(stop => {
            const originalIndex = stops.indexOf(stop);
            const marker = L.marker(stop.coords, { icon: markerIcon(originalIndex), title: stop.city });
            marker.on('click', () => showStop(stop, originalIndex, true));
            marker.addTo(markerLayer);
            markers.set(originalIndex, marker);
        });
        if (list.length > 1) {
            L.polyline(list.map(stop => stop.coords), { color:'#ff2a2a', weight:2, opacity:.75, dashArray:'7 10' }).addTo(routeLayer);
        }
        const bounds = L.latLngBounds(list.map(stop => stop.coords));
        map.fitBounds(bounds, { padding:[45,45], maxZoom:5 });
        document.getElementById('oasis-map-status').textContent = totalDates(list) + ' date · ' + list.length + ' città';
    }

    function initMap() {
        if (typeof L === 'undefined' || !document.getElementById('oasis-tour-map')) return;
        map = L.map('oasis-tour-map', { zoomControl:true, minZoom:2, worldCopyJump:true, scrollWheelZoom:false }).setView([49,2],4);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom:18, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);
        markerLayer = L.layerGroup().addTo(map);
        routeLayer = L.layerGroup().addTo(map);
        drawMap();
        setTimeout(() => map.invalidateSize(), 250);
    }

    function initRail() {
        const rail = document.getElementById('oasis-date-rail');
        rail.innerHTML = stops.map((stop,index) => '<button type="button" data-stop="' + index + '"><strong>' + String(index + 1).padStart(2,'0') + ' · ' + stop.city + '</strong>' + stop.dates.length + ' date · ' + stop.venue + '</button>').join('');
        rail.addEventListener('click', event => {
            const button = event.target.closest('[data-stop]');
            if (!button) return;
            const index = Number(button.dataset.stop);
            showStop(stops[index], index, true);
            button.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'center' });
        });
        showStop(stops[0], 0, false);
    }

    function initFilters() {
        document.querySelectorAll('[data-map-filter]').forEach(button => button.addEventListener('click', () => {
            currentFilter = button.dataset.mapFilter;
            document.querySelectorAll('[data-map-filter]').forEach(item => item.classList.toggle('is-active', item === button));
            drawMap();
        }));
    }

    function initAlbums() {
        const track = document.getElementById('oasis-album-track');
        if (!track || !document.getElementById('album-prev')) return;
        const move = direction => track.scrollBy({ left: direction * Math.min(370, track.clientWidth * .82), behavior:'smooth' });
        document.getElementById('album-prev').addEventListener('click', () => move(-1));
        document.getElementById('album-next').addEventListener('click', () => move(1));
    }


    // ===== Tracklist: click sulla copertina (edizioni originali UK) =====
    const TRACKLISTS = {
        'definitely-maybe': ['Rock ’n’ Roll Star','Shakermaker','Live Forever','Up in the Sky','Columbia','Supersonic','Bring It On Down','Cigarettes & Alcohol','Digsy’s Dinner','Slide Away','Married with Children'],
        'morning-glory': ['Hello','Roll with It','Wonderwall','Don’t Look Back in Anger','Hey Now!','The Swamp Song (Excerpt 1)','Some Might Say','Cast No Shadow','She’s Electric','Morning Glory','The Swamp Song (Excerpt 2)','Champagne Supernova'],
        'be-here-now': ['D’You Know What I Mean?','My Big Mouth','Magic Pie','Stand by Me','I Hope, I Think, I Know','The Girl in the Dirty Shirt','Fade In-Out','Don’t Go Away','Be Here Now','All Around the World','It’s Gettin’ Better (Man!!)','All Around the World (Reprise)'],
        'the-masterplan': ['Acquiesce','Underneath the Sky','Talk Tonight','Going Nowhere','Fade Away','The Swamp Song','I Am the Walrus (live)','Listen Up','Rockin’ Chair','Half the World Away','(It’s Good) To Be Free','Stay Young','Headshrinker','The Masterplan'],
        'standing-on-the-shoulder-of-giants': ['Fuckin’ in the Bushes','Go Let It Out','Who Feels Love?','Put Yer Money Where Yer Mouth Is','Little James','Gas Panic!','Where Did It All Go Wrong?','Sunday Morning Call','I Can See a Liar','Roll It Over'],
        'heathen-chemistry': ['The Hindu Times','Force of Nature','Hung in a Bad Place','Stop Crying Your Heart Out','Songbird','Little by Little','A Quick Peep','(Probably) All in the Mind','She Is Love','Born on a Different Cloud','Better Man'],
        'dont-believe-the-truth': ['Turn Up the Sun','Mucky Fingers','Lyla','Love Like a Bomb','The Importance of Being Idle','The Meaning of Soul','Guess God Thinks I’m Abel','Part of the Queue','Keep the Dream Alive','A Bell Will Ring','Let There Be Love'],
        'dig-out-your-soul': ['Bag It Up','The Turning','Waiting for the Rapture','The Shock of the Lightning','I’m Outta Time','(Get Off Your) High Horse Lady','Falling Down','To Be Where There’s Life','Ain’t Got Nothin’','The Nature of Reality','Soldier On']
    };

    function initTracklists() {
        document.querySelectorAll('.story-album').forEach(item => {
            const cover = item.querySelector('.story-cover');
            const title = item.querySelector('h3');
            const slug = cover && cover.dataset.album;
            const tracks = slug && TRACKLISTS[slug];
            if (!cover || !tracks) return;
            const panel = document.createElement('div');
            panel.className = 'story-tracks';
            panel.id = 'tracks-' + slug;
            panel.hidden = true;
            panel.innerHTML = '<div class="story-tracks-head"><span>Tracklist</span><button type="button" aria-label="Chiudi tracklist">×</button></div>' +
                '<p class="story-tracks-title">' + (title ? title.textContent : '') + '</p>' +
                '<ol>' + tracks.map(t => '<li>' + t + '</li>').join('') + '</ol>';
            item.appendChild(panel);
            cover.setAttribute('role', 'button');
            cover.setAttribute('tabindex', '0');
            cover.setAttribute('aria-expanded', 'false');
            cover.setAttribute('aria-controls', panel.id);
            cover.setAttribute('title', 'Mostra la tracklist');
            const setOpen = open => {
                panel.hidden = !open;
                item.classList.toggle('is-open', open);
                cover.setAttribute('aria-expanded', String(open));
                item.style.minHeight = open && window.innerWidth > 900 ? panel.offsetHeight + 'px' : '';
            };
            cover.addEventListener('click', () => setOpen(panel.hidden));
            cover.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(panel.hidden); } });
            panel.querySelector('button').addEventListener('click', () => { setOpen(false); cover.focus(); });
        });
    }

    function initReveal() {
        const items = document.querySelectorAll('.reveal');
        if (!('IntersectionObserver' in window)) { items.forEach(item => item.classList.add('is-visible')); return; }
        const observer = new IntersectionObserver(entries => entries.forEach(entry => {
            if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
        }), { threshold:.13 });
        items.forEach(item => observer.observe(item));
    }

    function initCounters() {
        document.querySelectorAll('[data-count]').forEach(element => {
            const target = Number(element.dataset.count);
            let value = 0;
            const tick = () => { value += Math.max(1, Math.ceil(target / 24)); element.textContent = Math.min(value,target); if (value < target) requestAnimationFrame(tick); };
            tick();
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        initRail(); initMap(); initFilters(); initAlbums(); initTracklists(); initReveal(); initCounters();
    });
})();
