const {app,BrowserWindow,globalShortcut}=require('electron'),path=require('path');
const PANIC='CommandOrControl+Alt+Shift+X'; // skift genvejen her
app.setAppUserModelId('dk.besked.app');
let win;
app.whenReady().then(()=>{
  win=new BrowserWindow({width:1000,height:680,backgroundColor:'#1e1f22',autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'preload.js')}});
  win.loadFile('index.html');
  globalShortcut.register(PANIC,()=>win.webContents.send('panic')); // virker også når appen ikke er i fokus
});
app.on('window-all-closed',()=>app.quit());
