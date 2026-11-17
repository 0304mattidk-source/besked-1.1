const {app,BrowserWindow,globalShortcut,ipcMain,Tray,Menu,nativeImage,session}=require('electron'),path=require('path'),fs=require('fs');
const PANIC='CommandOrControl+Alt+Shift+X'; // skift genvejen her
app.setAppUserModelId('dk.besked.app');
app.setPath('userData',path.join(app.getPath('appData'),'besked')); // beholder gemte logins efter navneskiftet
let win,tray,quitting=false,upd=null,prefs={protect:true,tray:true,startup:false};
const PF=()=>path.join(app.getPath('userData'),'prefs.json');
try{Object.assign(prefs,JSON.parse(fs.readFileSync(PF(),'utf8')))}catch{}
const show=()=>{win.show();win.focus()};
const set=(k,v)=>{prefs[k]=v;try{fs.writeFileSync(PF(),JSON.stringify(prefs))}catch{}apply()};
const menu=()=>Menu.buildFromTemplate([{label:'Åbn Master Debate',click:show},{type:'separator'},
  {label:'Start med Windows',type:'checkbox',checked:!!prefs.startup,click:i=>set('startup',i.checked)},
  {label:'Skærmbilleds-beskyttelse',type:'checkbox',checked:!!prefs.protect,click:i=>set('protect',i.checked)},
  {label:'Luk til systembakke',type:'checkbox',checked:!!prefs.tray,click:i=>set('tray',i.checked)},
  {type:'separator'},{label:'Afslut',click:()=>{quitting=true;app.quit()}}]);
function apply(){if(win)win.setContentProtection(!!prefs.protect);app.setLoginItemSettings({openAtLogin:!!prefs.startup,args:['--hidden']});if(tray)tray.setContextMenu(menu())}
function checkUpdate(){return new Promise(res=>{
  let au;try{au=require('electron-updater').autoUpdater}catch{return res('none')}
  if(!app.isPackaged)return res('none');
  let done=0;const fin=v=>{if(!done){done=1;res(v)}};
  au.on('update-available',()=>fin('installing'));
  au.on('download-progress',p=>win.webContents.send('upd',Math.round(p.percent)));
  au.on('update-downloaded',()=>{quitting=true;au.quitAndInstall(true,true)});
  au.on('update-not-available',()=>fin('none'));
  au.on('error',()=>{if(done)win.webContents.send('upd','fejl');else fin('none')});
  setTimeout(()=>fin('none'),12000);
  au.checkForUpdates().catch(()=>fin('none'))})}
ipcMain.handle('update',()=>upd||(upd=checkUpdate()));
ipcMain.handle('prefs',()=>prefs);
ipcMain.handle('setpref',(e,k,v)=>{if(k in prefs)set(k,!!v)});
ipcMain.on('badge',(e,b)=>{if(!tray||!win)return;tray.setToolTip(b.n?`Master Debate – ${b.n} ulæste`:'Master Debate');
  if(b.tray)tray.setImage(nativeImage.createFromDataURL(b.tray).resize({width:32}));
  win.setOverlayIcon(b.over?nativeImage.createFromDataURL(b.over):null,b.n?`${b.n} ulæste`:'')});
app.on('before-quit',()=>{quitting=true});
if(!app.requestSingleInstanceLock())app.quit();
app.on('second-instance',()=>win&&show());
app.whenReady().then(()=>{session.defaultSession.setPermissionRequestHandler((wc,p,cb)=>cb(['media','notifications'].includes(p)));const icon=path.join(__dirname,'icon.png');
  win=new BrowserWindow({width:1000,height:680,show:!process.argv.includes('--hidden'),icon,backgroundColor:'#16171a',autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'preload.js')}});
  win.loadFile('index.html');
  win.on('close',e=>{if(!quitting&&prefs.tray){e.preventDefault();win.hide()}});
  tray=new Tray(nativeImage.createFromPath(icon).resize({width:32}));tray.setToolTip('Master Debate');
  tray.on('click',()=>win.isVisible()?win.hide():show());
  apply();globalShortcut.register(PANIC,()=>win.webContents.send('panic')); // virker også når appen ikke er i fokus
});
