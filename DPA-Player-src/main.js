'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const url = require('url');

const AUDIO_EXT = ['.mp3', '.wav', '.flac', '.ogg', '.oga', '.m4a', '.aac', '.opus', '.wma'];
const STATE_FILE = () => path.join(app.getPath('userData'), 'dpa-state.json');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 380,
    minHeight: 520,
    backgroundColor: '#0d0d0d',
    title: 'DPA Player',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // il preload usa moduli Node (url, ipc); resta comunque isolato dal renderer
      // App locale che riproduce file dal disco dell'utente: serve caricare file://
      webSecurity: false,
      spellcheck: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Menu essenziale in italiano
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Aggiungi cartella…', accelerator: 'CmdOrCtrl+O', click: () => win.webContents.send('menu', 'add-folder') },
        { label: 'Aggiungi file…', accelerator: 'CmdOrCtrl+Shift+O', click: () => win.webContents.send('menu', 'add-files') },
        { type: 'separator' },
        { role: 'quit', label: 'Esci' }
      ]
    },
    {
      label: 'Riproduzione',
      submenu: [
        { label: 'Play / Pausa', accelerator: 'Space', click: () => win.webContents.send('media', 'toggle') },
        { label: 'Successivo', accelerator: 'CmdOrCtrl+Right', click: () => win.webContents.send('media', 'next') },
        { label: 'Precedente', accelerator: 'CmdOrCtrl+Left', click: () => win.webContents.send('media', 'prev') }
      ]
    },
    {
      label: 'Vista',
      submenu: [
        { role: 'reload', label: 'Ricarica' },
        { role: 'togglefullscreen', label: 'Schermo intero' },
        { role: 'toggleDevTools', label: 'Strumenti sviluppatore' }
      ]
    },
    {
      label: 'DPA',
      submenu: [
        { label: 'Vai al sito', click: () => shell.openExternal('https://www.undergroundplatform.xyz') },
        { label: 'Eventi', click: () => shell.openExternal('https://www.undergroundplatform.xyz/eventi.html') },
        { label: 'Archivio', click: () => shell.openExternal('https://www.undergroundplatform.xyz/archivio.html') }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- Scansione cartelle ----------
async function walk(dir, out, onFile) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
  catch (e) { return; }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name.startsWith('.')) continue;
      await walk(full, out, onFile);
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (AUDIO_EXT.includes(ext)) {
        out.push(full);
        if (onFile) onFile(out.length);
      }
    }
  }
}

function guessFromName(fp) {
  const base = path.basename(fp).replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const parts = base.split(' - ');
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { artist: 'Sconosciuto', title: base };
}

let mmMod = null;
async function readMeta(fp) {
  try {
    if (!mmMod) mmMod = require('music-metadata');
    const m = await mmMod.parseFile(fp, { duration: true, skipCovers: true });
    const c = m.common || {};
    const g = guessFromName(fp);
    return {
      title: c.title || g.title,
      artist: c.artist || (c.artists && c.artists[0]) || g.artist,
      album: c.album || '',
      duration: (m.format && m.format.duration) || 0
    };
  } catch (e) {
    const g = guessFromName(fp);
    return { title: g.title, artist: g.artist, album: '', duration: 0 };
  }
}

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'multiSelections'] });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('pick-files', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: AUDIO_EXT.map(e => e.slice(1)) }]
  });
  return r.canceled ? [] : r.filePaths;
});

// Scansiona una lista di cartelle e/o file, con metadati (concorrenza limitata)
ipcMain.handle('scan', async (evt, inputs) => {
  const files = [];
  const dirs = [];
  for (const p of (inputs || [])) {
    try {
      const st = await fsp.stat(p);
      if (st.isDirectory()) dirs.push(p);
      else if (st.isFile() && AUDIO_EXT.includes(path.extname(p).toLowerCase())) files.push(p);
    } catch (e) {}
  }
  for (const d of dirs) {
    await walk(d, files, (n) => { if (n % 25 === 0) evt.sender.send('scan-progress', { found: n }); });
  }
  // dedup
  const seen = new Set();
  const uniq = files.filter(f => { if (seen.has(f)) return false; seen.add(f); return true; });
  evt.sender.send('scan-progress', { found: uniq.length, phase: 'meta', total: uniq.length });

  const out = [];
  let idx = 0;
  const CONC = 8;
  async function worker() {
    while (idx < uniq.length) {
      const my = idx++;
      const fp = uniq[my];
      const meta = await readMeta(fp);
      out[my] = { path: fp, name: path.basename(fp), title: meta.title, artist: meta.artist, album: meta.album, duration: meta.duration };
      if (my % 20 === 0) evt.sender.send('scan-progress', { done: out.filter(Boolean).length, total: uniq.length, phase: 'meta' });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, uniq.length || 1) }, worker));
  return out.filter(Boolean);
});

// Copertina on-demand per il brano in riproduzione
ipcMain.handle('get-cover', async (evt, fp) => {
  try {
    if (!mmMod) mmMod = require('music-metadata');
    const m = await mmMod.parseFile(fp, { skipCovers: false });
    const pic = mmMod.selectCover ? mmMod.selectCover(m.common.picture) : (m.common.picture && m.common.picture[0]);
    if (pic && pic.data) {
      const b64 = Buffer.from(pic.data).toString('base64');
      return 'data:' + (pic.format || 'image/jpeg') + ';base64,' + b64;
    }
  } catch (e) {}
  return null;
});

ipcMain.handle('load-state', async () => {
  try { return JSON.parse(await fsp.readFile(STATE_FILE(), 'utf8')); }
  catch (e) { return { folders: [], files: [], settings: {} }; }
});

ipcMain.handle('save-state', async (evt, state) => {
  try { await fsp.writeFile(STATE_FILE(), JSON.stringify(state || {}, null, 2), 'utf8'); return true; }
  catch (e) { return false; }
});

ipcMain.handle('open-external', async (evt, u) => { try { await shell.openExternal(u); } catch (e) {} });

app.whenReady().then(() => {
  createWindow();

  // Tasti multimediali di sistema
  const send = (m) => { if (win && !win.isDestroyed()) win.webContents.send('media', m); };
  try {
    globalShortcut.register('MediaPlayPause', () => send('toggle'));
    globalShortcut.register('MediaNextTrack', () => send('next'));
    globalShortcut.register('MediaPreviousTrack', () => send('prev'));
  } catch (e) {}

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
