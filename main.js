const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWin = null;
let outputWin = null;

// -------- Logging --------
function tmLog(){ try{
  const msg = '[TM] ' + Array.from(arguments).map(x=> (typeof x==='object'? JSON.stringify(x) : String(x))).join(' ');
  console.log(msg);
  const p = path.join(app.getPath('userData'), 'taskmaster.log');
  fs.appendFileSync(p, msg + '\n', 'utf-8');
} catch(e){} }
process.on('uncaughtException', err=> tmLog('uncaughtException', err && (err.stack||err.message) || String(err)));
process.on('unhandledRejection', err=> tmLog('unhandledRejection', String(err)));

// -------- Windows --------
function createMainWindow(){
  tmLog('Creating Main Window...');
  mainWin = new BrowserWindow({
    width: 1280, height: 800,
    backgroundColor: '#111111',
    webPreferences: {
      preload: path.join(__dirname, 'js', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true // Required for your <webview> previews
    }
  });
  mainWin.setMenuBarVisibility(false);
  mainWin.loadFile(path.join(__dirname, 'index.html'));
  mainWin.on('closed', ()=>{ mainWin = null; });
  globalThis.mainWin = mainWin;
  return mainWin;
}

function createOrReuseOutput(displayId){
  tmLog(`Creating or Reusing Output for Display: ${displayId}`);
  try{
    const displays = screen.getAllDisplays();
    const target = displays.find(d => String(d.id) === String(displayId)) || displays[0];
    if (outputWin && !outputWin.isDestroyed()){
      outputWin.setBounds(target.bounds);
      outputWin.setFullScreen(true);
      outputWin.show(); outputWin.focus();
      return outputWin;
    }
    outputWin = new BrowserWindow({
      x: target.bounds.x, y: target.bounds.y,
      width: target.bounds.width, height: target.bounds.height,
      backgroundColor: '#000000',
      webPreferences: {
        preload: path.join(__dirname, 'js', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: true // Required for output.html
      }
    });
    outputWin.setMenuBarVisibility(false);
    outputWin.on('closed', ()=>{ outputWin = null; });
    outputWin.loadFile(path.join(__dirname, 'output.html'));
    outputWin.setFullScreen(true);
    globalThis.outputWin = outputWin;
    return outputWin;
  }catch(e){ tmLog('createOrReuseOutput error', e && e.message || e); }
}

// -------- In-app display picker --------
async function showDisplayPickerModal(parentWin){
  return new Promise((resolve)=>{
    try{
      const displays = screen.getAllDisplays().map((d,i)=>({ id:String(d.id), label:`Display ${i+1} (${d.bounds.width}x${d.bounds.height})` }));
      const picker = new BrowserWindow({
        width: 420, height: 260, resizable:false, minimizable:false, maximizable:false,
        modal:true, parent: parentWin || null, title:'Choose Display',
        webPreferences:{ nodeIntegration: true, contextIsolation: false }
      });
      picker.setMenuBarVisibility(false);
      const done = (val)=>{ try{ resolve(val); } finally { try{ picker.close(); }catch{} } };
      const chooseCh='picker:choose', cancelCh='picker:cancel';
      const cleanup=()=>{ try{ ipcMain.removeAllListeners(chooseCh);}catch{} try{ ipcMain.removeAllListeners(cancelCh);}catch{} };
      ipcMain.once(chooseCh, (_e,id)=>{ cleanup(); done(id||null); });
      ipcMain.once(cancelCh, ()=>{ cleanup(); done(null); });
      picker.on('closed', ()=>{ cleanup(); });
      picker.loadFile(path.join(__dirname, 'display-picker.html'));
      picker.webContents.once('did-finish-load', ()=>{ try{ picker.webContents.send('picker:init', displays); }catch{} });
    }catch(e){ tmLog('showDisplayPickerModal error', e && e.message || e); resolve(null); }
  });
}

// -------- IPC: Core Handlers --------
ipcMain.handle('load-project', async (_e, filePath)=>{
  try{
    if (!filePath){
      const res = await dialog.showOpenDialog(mainWin, { filters:[{name:'Taskmaster Project', extensions:['json']}], properties:['openFile'] });
      if (res.canceled || !res.filePaths.length) return { canceled:true };
      filePath = res.filePaths[0];
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return { canceled:false, path:filePath, data: JSON.parse(raw) };
  }catch(e){ tmLog('load-project error', e && e.message || e); throw e; }
});

ipcMain.handle('save-project', async (_e, payload)=>{
  try{
    const { path:givenPath, data } = payload || {};
    let filePath = givenPath;
    if (!filePath){
      const res = await dialog.showSaveDialog(mainWin, { filters:[{name:'Taskmaster Project', extensions:['json']}], defaultPath:'taskmaster-project.json' });
      if (res.canceled || !res.filePath) return { canceled:true };
      filePath = res.filePath;
    }
    fs.writeFileSync(filePath, JSON.stringify(data||{}, null, 2), 'utf-8');
    return { canceled:false, path:filePath };
  }catch(e){ tmLog('save-project error', e && e.message || e); throw e; }
});

ipcMain.handle('choose-display', async ()=>{
  try { return await showDisplayPickerModal(mainWin); }
  catch(e){ tmLog('choose-display handler error', e && e.message || e); return null; }
});

ipcMain.handle('output:playUrl', async (_event, payload) => {
  try {
    const { src, displayId, delayMs } = payload || {};
    if (!src) { tmLog('output:playUrl missing src'); return { ok: false, error: 'missing src' }; }
    if (!displayId) { tmLog('output:playUrl missing displayId'); return { ok: false, error: 'missing displayId' }; }

    const win = createOrReuseOutput(displayId);
    win.show(); win.focus(); win.setFullScreen(true);

    const delay = Number(delayMs) || 5000;
    const outputPayload = { type: 'iframe', src: src };

    setTimeout(() => {
      try {
        win.webContents.send('output:show', outputPayload);
        tmLog('output:playUrl sent to output window');
      } catch (err) { tmLog('output:playUrl webContents.send error', err, err.message); }
    }, delay);

    return { ok: true };
  } catch (e) { tmLog('output:playUrl handler error', e, e.message); return { ok: false, error: String(e,e.message) }; }
});

ipcMain.handle('close-output', async ()=>{
  try{ if (outputWin && !outputWin.isDestroyed()) outputWin.close(); }
  catch(e){ tmLog('close-output handle error', e, e.message); }
});

ipcMain.handle('fullscreen-output', () => {
  try { if (outputWin && !outputWin.isDestroyed()) { outputWin.setFullScreen(true); outputWin.show(); } } 
  catch(e) { tmLog('fullscreen-output error', e); }
});

ipcMain.handle('toggle-app-fullscreen', () => {
  try { if (mainWin && !mainWin.isDestroyed()) { mainWin.setFullScreen(!mainWin.isFullScreen()); } } 
  catch(e) { tmLog('toggle-app-fullscreen error', e); }
});

ipcMain.handle('list-displays', () => {
  try { return screen.getAllDisplays().map((d,i)=>({ id:String(d.id), label:`Display ${i+1} (${d.bounds.width}x${d.bounds.height})` })); } 
  catch(e) { tmLog('list-displays error', e); return []; }
});

// This handler is required to stop the renderer from crashing on load
ipcMain.handle('preview:url', (url) => { 
  tmLog('preview:url called', url);
  return null; // Return null to stop the crash
});

// -------- App lifecycle --------
app.whenReady().then(()=>{
  tmLog('App is ready.');
  createMainWindow(); // This is the only window that should load
  app.on('activate', ()=>{ if (BrowserWindow.getAllWindows().length===0) createMainWindow(); });
});
app.on('window-all-closed', ()=>{ if (process.platform !== 'darwin') app.quit(); });

// --- Clean up old/unused handlers ---
ipcMain.removeAllListeners('output:show');
ipcMain.removeHandler('open-output');
ipcMain.removeHandler('preview:open');
ipcMain.removeHandler('pick-files');