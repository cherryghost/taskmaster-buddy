const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('taskmasterAPI', {
  // Project IO
  saveProject: (data) => ipcRenderer.invoke('save-project', data),
  loadProject: () => ipcRenderer.invoke('load-project'),
  
  // Main Window Control
  toggleAppFullscreen: () => ipcRenderer.invoke('toggle-app-fullscreen'),

  // Output Window Control
  closeOutput: () => ipcRenderer.invoke('close-output'),
  fullscreenOutput: () => ipcRenderer.invoke('fullscreen-output'),
  
  // Sending Content
  playUrl: (payload) => ipcRenderer.invoke('output:playUrl', payload),

  // Display Utilities
  chooseDisplay: () => ipcRenderer.invoke('choose-display'),
  listDisplays: () => ipcRenderer.invoke('list-displays'),

  // Preview API
  requestPreview: (url) => ipcRenderer.invoke('preview:url', url),
  
  // Listener for Output Window
  onOutputShow: (cb) => {
    ipcRenderer.removeAllListeners('output:show');
    ipcRenderer.on('output:show', (_event, payload) => cb(payload));
  },
});