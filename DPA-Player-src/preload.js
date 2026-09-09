'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const url = require('url');

contextBridge.exposeInMainWorld('dpa', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  scan: (inputs) => ipcRenderer.invoke('scan', inputs),
  getCover: (p) => ipcRenderer.invoke('get-cover', p),
  loadState: () => ipcRenderer.invoke('load-state'),
  saveState: (s) => ipcRenderer.invoke('save-state', s),
  openExternal: (u) => ipcRenderer.invoke('open-external', u),
  fileUrl: (p) => url.pathToFileURL(p).href,
  onScanProgress: (cb) => ipcRenderer.on('scan-progress', (e, d) => cb(d)),
  onMedia: (cb) => ipcRenderer.on('media', (e, m) => cb(m)),
  onMenu: (cb) => ipcRenderer.on('menu', (e, m) => cb(m))
});
