// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Funções de controle (Iniciar/Parar)
  // 'replicaId' é opcional, usado apenas para réplicas
  startServer: (options) => ipcRenderer.send('start-server', options),
  stopServer: (role, replicaId) => ipcRenderer.send('stop-server', role, replicaId),

  // Funções do Cliente
  fetchFiles: (serverAddress) => ipcRenderer.invoke('fetch-files', serverAddress),
  downloadFile: (options) => ipcRenderer.send('download-file', options),
  
  // Funções do Servidor
  getLocalFiles: (role, replicaId) => ipcRenderer.invoke('get-local-files', role, replicaId),
  deleteFile: (role, filename, replicaId) => ipcRenderer.invoke('delete-file', role, filename, replicaId),
  syncReplica: (options) => ipcRenderer.send('sync-replica', options),
  addFileToServer: () => ipcRenderer.send('add-file-to-server'),

  // Funções da Réplica
  startReplicaSync: (options) => ipcRenderer.send('start-replica-sync', options),
  
  // Callbacks de Status
  // 'args' agora inclui o replicaId quando aplicável
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (e, ...args) => callback(...args)),
  onFileProgress: (callback) => ipcRenderer.on('file-progress', (e, ...args) => callback(...args)),
  onFileListUpdated: (callback) => ipcRenderer.on('file-list-updated', (e, ...args) => callback(...args)),
  onSyncStart: (callback) => ipcRenderer.on('sync-start', (e, ...args) => callback(...args)),
});