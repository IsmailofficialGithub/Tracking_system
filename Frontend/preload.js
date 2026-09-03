const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getScreenSource: () => ipcRenderer.invoke('get-screen-source')
});
