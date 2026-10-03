const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('tp', {
  saveServer: (address) => ipcRenderer.invoke('save-server', address)
})
