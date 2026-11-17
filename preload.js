const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('api',{
  onPanic:f=>ipcRenderer.on('panic',f),
  update:()=>ipcRenderer.invoke('update'),
  onUpd:f=>ipcRenderer.on('upd',(e,v)=>f(v)),
  getPrefs:()=>ipcRenderer.invoke('prefs'),
  setPref:(k,v)=>ipcRenderer.invoke('setpref',k,v),
  badge:b=>ipcRenderer.send('badge',b)});
