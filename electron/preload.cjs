const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('xriftApi', {
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  checkEnvironment: () => ipcRenderer.invoke('xrift:check-environment'),
  installCli: (commandId) => ipcRenderer.invoke('xrift:install-cli', { commandId }),
  createWorld: (payload) => ipcRenderer.invoke('xrift:create-world', payload),
  startLocalDev: (payload) => ipcRenderer.invoke('xrift:start-local-dev', payload),
  stopLocalDev: () => ipcRenderer.invoke('xrift:stop-local-dev'),
  getLocalDevStatus: () => ipcRenderer.invoke('xrift:local-dev-status'),
  updateWorldConfig: (payload) => ipcRenderer.invoke('xrift:update-world-config', payload),
  login: (commandId) => ipcRenderer.invoke('xrift:login', { commandId }),
  whoami: () => ipcRenderer.invoke('xrift:whoami'),
  uploadWorld: (payload) => ipcRenderer.invoke('xrift:upload-world', payload),
  onCommandLog: (listener) => {
    const wrapped = (_event, data) => listener(data)
    ipcRenderer.on('xrift:command-log', wrapped)
    return () => ipcRenderer.removeListener('xrift:command-log', wrapped)
  },
  onLocalDevStatus: (listener) => {
    const wrapped = (_event, data) => listener(data)
    ipcRenderer.on('xrift:local-dev-status', wrapped)
    return () => ipcRenderer.removeListener('xrift:local-dev-status', wrapped)
  }
})
