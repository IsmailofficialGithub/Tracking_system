const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getScreenSource: () => ipcRenderer.invoke('get-screen-source'),
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  setMiniMode: (isMini) => ipcRenderer.send('window-set-mini-mode', isMini)
});
