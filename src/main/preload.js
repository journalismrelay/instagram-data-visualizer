const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  processData: (folderPaths) => ipcRenderer.invoke('process-data', folderPaths),
  onProcessingProgress: (callback) => {
    ipcRenderer.on('processing-progress', (_event, data) => callback(data));
  },
});
