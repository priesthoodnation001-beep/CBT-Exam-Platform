const { app, BrowserWindow, dialog } = require('electron')
const { spawn } = require('child_process')
const path = require('path')

let serverProcess

function startServer() {
  const serverPath = path.join(process.resourcesPath, 'server', 'index.cjs')
  const dataPath = path.join(app.getPath('userData'), 'data')
  serverProcess = spawn(process.execPath, [serverPath], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', CBT_DATA_DIR: dataPath, PORT: '8787' },
    windowsHide: true,
  })
  serverProcess.on('error', (error) => dialog.showErrorBox('TIMPRIEST EDU server error', error.message))
}

async function createWindow() {
  const window = new BrowserWindow({ width: 1440, height: 920, minWidth: 980, minHeight: 680, backgroundColor: '#fff8eb', webPreferences: { contextIsolation: true, nodeIntegration: false } })
  const url = 'http://127.0.0.1:8787/'
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { await fetch(url); break } catch { await new Promise((resolve) => setTimeout(resolve, 200)) }
  }
  await window.loadURL(url)
}

app.whenReady().then(() => { startServer(); createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() }) })
app.on('window-all-closed', () => { if (serverProcess) serverProcess.kill(); if (process.platform !== 'darwin') app.quit() })