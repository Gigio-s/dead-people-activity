'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };

  // ---------- Stato ----------
  var sources = { folders: [], files: [] };
  var settings = { shuffle: true, repeat: 'off', volume: 1 };
  var library = [];
  var current = -1, order = [], orderPos = -1;
  var audio = $('audio');

  // ---------- Util ----------
  function fmt(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return m + ':' + (ss < 10 ? '0' : '') + ss;
  }
  function baseName(p) { var x = p.replace(/[\\/]+$/, ''); var i = Math.max(x.lastIndexOf('/'), x.lastIndexOf('\\')); return i >= 0 ? x.slice(i + 1) : x; }

  // ---------- Persistenza ----------
  function persist() {
    window.dpa.saveState({ folders: sources.folders, files: sources.files, settings: settings });
  }

  // ---------- Sorgenti ----------
  function renderSources() {
    var el = $('sources'); el.innerHTML = '';
    sources.folders.forEach(function (p) { el.appendChild(chip(p, 'folder')); });
    sources.files.forEach(function (p) { el.appendChild(chip(p, 'file')); });
  }
  function chip(p, kind) {
    var d = document.createElement('span');
    d.className = 'chip';
    d.innerHTML = (kind === 'folder' ? '🗂 ' : '♪ ') + '<b></b><button title="Rimuovi">✕</button>';
    d.querySelector('b').textContent = baseName(p);
    d.querySelector('b').title = p;
    d.querySelector('button').addEventListener('click', function () { removeSource(p, kind); });
    return d;
  }
  function removeSource(p, kind) {
    if (kind === 'folder') sources.folders = sources.folders.filter(function (x) { return x !== p; });
    else sources.files = sources.files.filter(function (x) { return x !== p; });
    persist(); rescan();
  }

  // ---------- Scansione ----------
  function setScan(show, txt) { var b = $('scanbar'); b.classList.toggle('show', !!show); if (txt) $('scanText').textContent = txt; }
  window.dpa.onScanProgress(function (d) {
    if (d.phase === 'meta') setScan(true, 'Lettura tag… ' + (d.done || 0) + ' / ' + (d.total || 0));
    else setScan(true, 'Trovati ' + (d.found || 0) + ' brani…');
  });

  var scanning = false;
  function rescan() {
    var inputs = sources.folders.concat(sources.files);
    if (!inputs.length) { library = []; current = -1; stopAudio(); renderLibrary(); return; }
    if (scanning) return;
    scanning = true; setScan(true, 'Scansione in corso…');
    window.dpa.scan(inputs).then(function (list) {
      library = list || [];
      library.sort(function (a, b) {
        var A = (a.artist + ' ' + a.title).toLowerCase(), B = (b.artist + ' ' + b.title).toLowerCase();
        return A < B ? -1 : A > B ? 1 : 0;
      });
      current = -1; order = []; orderPos = -1;
      scanning = false; setScan(false);
      renderLibrary();
    }).catch(function () { scanning = false; setScan(false); });
  }

  // ---------- Libreria ----------
  function renderLibrary() {
    var ul = $('tracklist'); ul.innerHTML = '';
    library.forEach(function (tr, i) {
      var li = document.createElement('li');
      li.className = 'track' + (i === current ? ' playing' : '');
      li.dataset.index = i;
      li.innerHTML =
        '<span class="idx">' + (i === current ? '▶' : (i + 1)) + '</span>' +
        '<span class="meta"><span class="t-title"></span><span class="t-artist"></span></span>' +
        '<span class="t-dur"></span>';
      li.querySelector('.t-title').textContent = tr.title || baseName(tr.path);
      li.querySelector('.t-artist').textContent = tr.artist || 'Sconosciuto';
      li.querySelector('.t-dur').textContent = tr.duration ? fmt(tr.duration) : '';
      li.querySelector('.meta').addEventListener('click', function () { playIndex(i); });
      ul.appendChild(li);
    });
    $('libCount').textContent = library.length + ' ' + (library.length === 1 ? 'brano' : 'brani');
    $('library').hidden = library.length === 0;
    $('intro').style.display = library.length ? 'none' : 'block';
    $('dropzone').style.display = library.length ? 'none' : 'block';
    applySearch();
  }

  function applySearch() {
    var q = ($('search').value || '').toLowerCase().trim();
    var rows = $('tracklist').children;
    for (var i = 0; i < rows.length; i++) {
      var tr = library[+rows[i].dataset.index];
      var hit = !q || ((tr.title || '') + ' ' + (tr.artist || '') + ' ' + (tr.album || '')).toLowerCase().indexOf(q) >= 0;
      rows[i].style.display = hit ? '' : 'none';
    }
  }

  // ---------- Riproduzione ----------
  function buildOrder(startIdx) {
    order = library.map(function (_, i) { return i; });
    if (settings.shuffle) {
      for (var k = order.length - 1; k > 0; k--) { var j = Math.floor(Math.random() * (k + 1)); var t = order[k]; order[k] = order[j]; order[j] = t; }
      var p = order.indexOf(startIdx);
      if (p > 0) { order.splice(p, 1); order.unshift(startIdx); }
    }
    orderPos = order.indexOf(startIdx);
  }

  function playIndex(i) {
    if (i < 0 || i >= library.length) return;
    if (!order.length || order.indexOf(i) === -1) buildOrder(i); else orderPos = order.indexOf(i);
    current = i;
    var tr = library[i];
    audio.src = window.dpa.fileUrl(tr.path);
    audio.play().catch(function () {});
    $('pbTitle').textContent = tr.title || baseName(tr.path);
    $('pbArtist').textContent = tr.artist || 'Sconosciuto';
    setCover(null);
    setMediaSession(tr, null);
    window.dpa.getCover(tr.path).then(function (cov) {
      if (current === i) { setCover(cov); setMediaSession(tr, cov); }
    });
    highlight();
  }
  function setCover(cov) {
    var c = $('pbCover');
    if (cov) { c.style.backgroundImage = "url('" + cov + "')"; c.textContent = ''; }
    else { c.style.backgroundImage = 'none'; c.textContent = '♪'; }
  }
  function highlight() {
    var rows = $('tracklist').children;
    for (var i = 0; i < rows.length; i++) {
      var idx = +rows[i].dataset.index;
      rows[i].classList.toggle('playing', idx === current);
      rows[i].querySelector('.idx').textContent = idx === current ? '▶' : (idx + 1);
    }
  }
  function togglePlay() {
    if (current === -1) { if (library.length) playIndex(order.length ? order[0] : 0); return; }
    if (audio.paused) audio.play().catch(function () {}); else audio.pause();
  }
  function next(auto) {
    if (!order.length) return;
    if (settings.repeat === 'one' && auto) { audio.currentTime = 0; audio.play(); return; }
    if (orderPos < order.length - 1) orderPos++;
    else if (settings.repeat === 'all' || !auto) orderPos = 0;
    else { audio.pause(); return; }
    playIndex(order[orderPos]);
  }
  function prev() {
    if (!order.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    orderPos = orderPos > 0 ? orderPos - 1 : order.length - 1;
    playIndex(order[orderPos]);
  }
  function stopAudio() {
    audio.pause(); audio.removeAttribute('src'); audio.load();
    current = -1; order = []; orderPos = -1;
    $('pbTitle').textContent = 'Niente in riproduzione';
    $('pbArtist').textContent = 'Aggiungi la tua musica per iniziare';
    setCover(null); $('playBtn').textContent = '▶';
  }

  // ---------- Media Session ----------
  function setMediaSession(tr, cov) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: tr.title || baseName(tr.path), artist: tr.artist || 'Sconosciuto', album: tr.album || 'DPA Player',
        artwork: cov ? [{ src: cov, sizes: '512x512', type: 'image/jpeg' }] : []
      });
    } catch (e) {}
  }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', function () { audio.play(); });
    navigator.mediaSession.setActionHandler('pause', function () { audio.pause(); });
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    navigator.mediaSession.setActionHandler('nexttrack', function () { next(false); });
  }

  // ---------- Audio events ----------
  audio.addEventListener('play', function () { $('playBtn').textContent = '⏸'; });
  audio.addEventListener('pause', function () { $('playBtn').textContent = '▶'; });
  audio.addEventListener('ended', function () { next(true); });
  audio.addEventListener('timeupdate', function () {
    if (!audio.duration) return;
    $('seek').value = (audio.currentTime / audio.duration) * 100;
    $('curTime').textContent = fmt(audio.currentTime);
  });
  audio.addEventListener('loadedmetadata', function () { $('durTime').textContent = fmt(audio.duration); });
  audio.addEventListener('error', function () { /* file mancante o formato non supportato: passa oltre */ if (current !== -1) next(true); });

  // ---------- Controlli UI ----------
  $('playBtn').addEventListener('click', togglePlay);
  $('nextBtn').addEventListener('click', function () { next(false); });
  $('prevBtn').addEventListener('click', prev);
  $('seek').addEventListener('input', function () { if (audio.duration) audio.currentTime = (this.value / 100) * audio.duration; });
  $('volume').addEventListener('input', function () { audio.volume = parseFloat(this.value); settings.volume = audio.volume; persist(); });
  $('shuffleBtn').addEventListener('click', function () {
    settings.shuffle = !settings.shuffle; this.classList.toggle('active', settings.shuffle);
    if (current >= 0) buildOrder(current); persist();
  });
  $('repeatBtn').addEventListener('click', function () {
    settings.repeat = settings.repeat === 'off' ? 'all' : (settings.repeat === 'all' ? 'one' : 'off');
    this.classList.toggle('active', settings.repeat !== 'off');
    this.textContent = settings.repeat === 'one' ? '↻¹' : '↻';
    this.title = 'Ripeti: ' + (settings.repeat === 'off' ? 'no' : (settings.repeat === 'all' ? 'tutti' : 'uno'));
    persist();
  });
  $('search').addEventListener('input', applySearch);

  function addFolder() { window.dpa.pickFolder().then(function (paths) {
    if (!paths || !paths.length) return;
    paths.forEach(function (p) { if (sources.folders.indexOf(p) === -1) sources.folders.push(p); });
    renderSources(); persist(); rescan();
  }); }
  function addFiles() { window.dpa.pickFiles().then(function (paths) {
    if (!paths || !paths.length) return;
    paths.forEach(function (p) { if (sources.files.indexOf(p) === -1) sources.files.push(p); });
    renderSources(); persist(); rescan();
  }); }

  $('addFolderBtn').addEventListener('click', addFolder);
  $('dzFolder').addEventListener('click', addFolder);
  $('addFilesBtn').addEventListener('click', addFiles);
  $('dzFiles').addEventListener('click', addFiles);
  $('rescanBtn').addEventListener('click', rescan);

  Array.prototype.forEach.call(document.querySelectorAll('.link-card'), function (c) {
    c.addEventListener('click', function () { window.dpa.openExternal(c.dataset.url); });
  });

  // ---------- Menu + tasti multimediali (dal main) ----------
  window.dpa.onMedia(function (m) { if (m === 'toggle') togglePlay(); else if (m === 'next') next(false); else if (m === 'prev') prev(); });
  window.dpa.onMenu(function (m) { if (m === 'add-folder') addFolder(); else if (m === 'add-files') addFiles(); });

  // ---------- Boot ----------
  window.dpa.loadState().then(function (st) {
    st = st || {};
    sources.folders = st.folders || [];
    sources.files = st.files || [];
    settings = Object.assign({ shuffle: true, repeat: 'off', volume: 1 }, st.settings || {});
    audio.volume = settings.volume;
    $('volume').value = settings.volume;
    $('shuffleBtn').classList.toggle('active', settings.shuffle);
    $('repeatBtn').classList.toggle('active', settings.repeat !== 'off');
    $('repeatBtn').textContent = settings.repeat === 'one' ? '↻¹' : '↻';
    renderSources();
    renderLibrary();
    if (sources.folders.length || sources.files.length) rescan();
  });
})();
