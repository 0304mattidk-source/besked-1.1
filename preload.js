const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('api',{onPanic:f=>ipcRenderer.on('panic',f)});
