const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getScreenSource: () => ipcRenderer.invoke('get-screen-source'),
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  setMiniMode: (isMini) => ipcRenderer.send('window-set-mini-mode', isMini),
  openExternalUrl: (url) => ipcRenderer.send('open-external-url', url),
  startUpdateDownload: (url) => ipcRenderer.send('start-update-download', url),
  onDownloadProgress: (callback) => ipcRenderer.on('update-download-progress', (_event, value) => callback(value)),
  onDownloadError: (callback) => ipcRenderer.on('update-download-error', (_event, err) => callback(err))
});
