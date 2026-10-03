// TIMPRIEST EDU desktop app (Windows). One installer, two modes chosen on first launch:
//   School Server    - runs the exam server on this computer (offline) and opens it in a window.
//   Student computer - opens the school server's address in a window.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')

const PORT = 8787
const ROOT = path.join(__dirname, '..')
const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json')
const DATA_ROOT = path.join(app.getPath('documents'), 'TIMPRIEST EDU')

let config = {}
let win = null
let quitting = false

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) } catch { return {} }
}

function saveConfig(next) {
  config = { ...config, ...next }
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((entry) => entry && (entry.family === 'IPv4' || entry.family === 4) && !entry.internal)
    .map((entry) => entry.address)
}

function chooseMode() {
  const choice = dialog.showMessageBoxSync({
    type: 'question',
    title: 'Set up this computer',
    message: 'How will this computer be used?',
    detail: 'School Server: ONE computer in the school that stores the exams and results.\nStudent computer: every other computer where students or teachers work.',
    buttons: ['School Server', 'Student computer', 'Cancel'],
    defaultId: 1,
    cancelId: 2
  })
  if (choice === 2) return false
  saveConfig({ mode: choice === 0 ? 'server' : 'student' })
  return true
}

function backupDatabase(dataDir) {
  try {
    const db = path.join(dataDir, 'timpriest-v2.sqlite')
    if (!fs.existsSync(db)) return
    const dir = path.join(DATA_ROOT, 'backups')
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
    fs.copyFileSync(db, path.join(dir, `timpriest-${stamp}.sqlite`))
    const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sqlite')).sort()
    for (const old of files.slice(0, -30)) fs.unlinkSync(path.join(dir, old))
  } catch (error) { console.error('Backup failed', error) }
}

function startServer() {
  const dataDir = path.join(DATA_ROOT, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  backupDatabase(dataDir)
  process.env.OFFLINE_MODE = '1'
  process.env.PORT = String(PORT)
  process.env.CBT_DATA_DIR = dataDir
  require(path.join(ROOT, 'server', 'index.cjs'))
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const attempt = (left) => {
      http.get(`http://127.0.0.1:${PORT}/api/health`, (response) => { response.resume(); resolve() })
        .on('error', () => left <= 0 ? reject(new Error('The exam server did not start.')) : setTimeout(() => attempt(left - 1), 500))
    }
    attempt(60)
  })
}

function normaliseAddress(input) {
  let text = String(input || '').trim()
  if (!text) return null
  if (!/^https?:\/\//i.test(text)) text = `http://${text}`
  try {
    const url = new URL(text)
    if (!url.hostname) return null
    if (!url.port) url.port = String(PORT)
    return url.toString()
  } catch { return null }
}

function showAddresses() {
  const list = lanAddresses().map((address) => `http://${address}:${PORT}/your-school-name`)
  dialog.showMessageBox(win, {
    type: 'info',
    title: 'Student address',
    message: list.length ? 'Students and teachers use this address:' : 'No network found.',
    detail: list.length
      ? `${list.join('\n')}\n\nReplace "your-school-name" with your school's link name, as shown after you sign in. Keep this window open while exams run.`
      : 'Connect this computer to the school router or Wi-Fi, then restart the app.'
  })
}

function showConnect(message = '') {
  win.loadFile(path.join(__dirname, 'connect.html'), { query: { message, address: config.serverAddress || '' } })
}

function buildMenu() {
  const isServer = config.mode === 'server'
  const items = isServer
    ? [
        { label: 'Show student address', click: showAddresses },
        { label: 'Open backups folder', click: () => { fs.mkdirSync(path.join(DATA_ROOT, 'backups'), { recursive: true }); shell.openPath(path.join(DATA_ROOT, 'backups')) } }
      ]
    : [{ label: 'Change server address', click: () => showConnect() }]
  items.push(
    { label: 'Change mode (server / student)', click: () => { if (chooseMode()) { quitting = true; app.relaunch(); app.quit() } } },
    { type: 'separator' },
    { role: 'reload' },
    { role: 'quit' }
  )
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'TIMPRIEST EDU', submenu: items }]))
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, show: false, autoHideMenuBar: true, title: 'TIMPRIEST EDU',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  })
  win.maximize()
  win.show()
  win.on('page-title-updated', (event) => event.preventDefault())
  const showUrl = (_event, url) => { if (String(url).startsWith('http')) win.setTitle(`TIMPRIEST EDU - ${url}`) }
  win.webContents.on('did-navigate', showUrl)
  win.webContents.on('did-navigate-in-page', showUrl)
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' } })
  win.on('close', (event) => {
    if (config.mode === 'server' && !quitting) {
      const choice = dialog.showMessageBoxSync(win, {
        type: 'warning', buttons: ['Keep running', 'Stop server'], defaultId: 0, cancelId: 0,
        message: 'Closing this window stops the exam server.',
        detail: 'Students will be disconnected. Do not close it while an exam is running.'
      })
      if (choice === 0) event.preventDefault()
    }
  })
  buildMenu()
}

async function openServerMode() {
  createWindow()
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<body style="font-family:Segoe UI,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f4f1e6;color:#1d4d2b"><h2>Starting the exam server...</h2></body>'))
  try {
    startServer()
    await waitForServer()
    win.loadURL(`http://localhost:${PORT}/`)
  } catch (error) {
    dialog.showErrorBox('Could not start the exam server', String(error && error.message || error))
    quitting = true
    app.quit()
  }
}

function openStudentMode() {
  createWindow()
  win.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) showConnect(`Could not reach ${config.serverAddress}. Check that the school server computer is on, then try again or change the address.`)
  })
  if (!config.serverAddress) showConnect()
  else win.loadURL(config.serverAddress)
}

ipcMain.handle('save-server', (_event, input) => {
  const address = normaliseAddress(input)
  if (!address) return { ok: false, error: 'Enter the address, for example 192.168.1.10 or http://192.168.1.10:8787/your-school-name' }
  saveConfig({ serverAddress: address })
  win.loadURL(address)
  return { ok: true }
})

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })
  app.whenReady().then(() => {
    config = readConfig()
    if (!config.mode && !chooseMode()) { app.quit(); return }
    if (config.mode === 'server') void openServerMode(); else openStudentMode()
  })
  app.on('window-all-closed', () => app.quit())
}
