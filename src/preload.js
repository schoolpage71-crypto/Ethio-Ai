const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // የሞዴሉን መኖር ማረጋገጫ
  checkModelStatus: () => ipcRenderer.invoke('check-model-status'),
  
  // ተማሪው Button ሲነካ ዳውንሎድ ለመጀመር
  startModelDownload: () => ipcRenderer.send('start-model-download'),
  
  // የዳውንሎድ ሂደቱን (Percentage) ለመከታተል
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, data) => callback(data)),
  
  // የሞዴሉ ወይም የሰርቨሩ ሁኔታ ሲቀየር ለማወቅ
  onStatusUpdate: (callback) => ipcRenderer.on('status-update', (event, data) => callback(data)),
  
  // ለ AI ሞዴሉ ጥያቄ ለመላክ
  sendChatMessage: (message) => ipcRenderer.invoke('send-chat-message', message)
});
