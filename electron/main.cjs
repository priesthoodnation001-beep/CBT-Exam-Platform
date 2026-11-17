// TIMPRIEST EDU role-specific desktop apps (Windows).
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const { autoUpdater } = require('electron-updater')

const PORT = 8787
const ROOT = path.join(__dirname, '..')
const DESKTOP_ROLE = require(path.join(ROOT, 'package.json')).desktopRole || 'All'
const CLOUD_ORIGIN = 'https://exam.timpriestedu.name.ng'
const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json')
const DATA_ROOT = path.join(app.getPath('documents'), 'TIMPRIEST EDU')

let config = {}
let win = null
let quitting = false
let manualUpdateCheck = false
let updateErrorDialogOpen = false

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
    if (!url.port && url.protocol === 'http:') url.port = String(PORT) // school-network addresses use our port; https links (the online site) keep theirs
    return url.toString()
  } catch { return null }
}

function showAddresses() {
  const list = lanAddresses().flatMap((address) => {
    const base = `http://${address}:${PORT}/cbt/your-school-name`
    return [`Admin: ${base}/admin`, `Teacher: ${base}/teacher`, `Student: ${base}/student`]
  })
  dialog.showMessageBox(win, {
    type: 'info',
    title: 'Student address',
    message: list.length ? 'Share the matching address with each person:' : 'No network found.',
    detail: list.length
      ? `${list.join('\n')}\n\nReplace "your-school-name" with your school's exact link name. Connect all devices to the same school Wi-Fi or LAN. Keep this computer and the TIMPRIEST EDU app running while exams are in progress.`
      : 'Connect this computer to the school router or Wi-Fi, then restart the app.'
  })
}

function showConnect(message = '') {
  win.loadFile(path.join(__dirname, 'connect.html'), { query: { message, address: config.serverAddress || '' } })
}

function reportUpdateError(error) {
  // Automatic checks at startup stay silent: no internet, or no published version, is normal and not worth a pop-up.
  // Only when someone clicks "Check for updates" do we show a message.
  const wasManual = manualUpdateCheck
  manualUpdateCheck = false
  console.error('Update check failed', error)
  if (!wasManual || updateErrorDialogOpen) return
  updateErrorDialogOpen = true
  const detail = String(error && error.message || error)
  const nothingPublished = /no published versions|latest\.yml|status code 404|cannot find/i.test(detail)
  const options = nothingPublished
    ? { type: 'info', title: 'No updates available', message: 'TIMPRIEST EDU is up to date.' }
    : { type: 'info', title: 'Could not check for updates', message: 'TIMPRIEST EDU could not check for updates right now.', detail: 'Make sure this computer is connected to the internet, then try again.' }
  void dialog.showMessageBox(win, options).finally(() => { updateErrorDialogOpen = false })
}

function configureAutoUpdates() {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('error', reportUpdateError)
  autoUpdater.on('update-not-available', () => {
    if (!manualUpdateCheck) return
    manualUpdateCheck = false
    void dialog.showMessageBox(win, {
      type: 'info',
      title: 'No updates available',
      message: 'TIMPRIEST EDU is up to date.'
    })
  })
  autoUpdater.on('update-available', (info) => {
    console.info(`TIMPRIEST EDU update ${info.version} is available`)
  })
  autoUpdater.on('update-downloaded', (info) => {
    manualUpdateCheck = false
    void dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update ready',
      message: `TIMPRIEST EDU ${info.version} has been downloaded.`,
      detail: 'Restart now to install the update, or choose Later to install it when you next close the app.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })
}

async function checkForUpdates(manual = false) {
  if (!app.isPackaged) {
    if (manual) {
      await dialog.showMessageBox(win, {
        type: 'info',
        title: 'Updates unavailable',
        message: 'Automatic updates are available in the installed desktop app.'
      })
    }
    return
  }

  manualUpdateCheck = manual
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    reportUpdateError(error)
  }
}

function buildMenu() {
  if (DESKTOP_ROLE !== 'All') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{
      label: `TIMPRIEST EDU ${DESKTOP_ROLE}`,
      submenu: [
        { label: 'Check for updates', click: () => { void checkForUpdates(true) } },
        { type: 'separator' },
        { role: 'reload' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }]))
    return
  }
  const isServer = config.mode === 'server'
  const items = isServer
    ? [
        { label: 'Show student address', click: showAddresses },
        { label: 'Open backups folder', click: () => { fs.mkdirSync(path.join(DATA_ROOT, 'backups'), { recursive: true }); shell.openPath(path.join(DATA_ROOT, 'backups')) } }
      ]
    : [{ label: 'Change server address', click: () => showConnect() }]
  if (DESKTOP_ROLE === 'All') {
    items.push({ label: 'Change mode (server / client)', click: () => { if (chooseMode()) { quitting = true; app.relaunch(); app.quit() } } })
  }
  items.push(
    { type: 'separator' },
    { label: 'Check for updates', click: () => { void checkForUpdates(true) } },
    { type: 'separator' },
    { role: 'reload' },
    { role: 'quit' }
  )
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: `TIMPRIEST EDU ${DESKTOP_ROLE}`, submenu: items }]))
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, show: false, autoHideMenuBar: true, title: 'TIMPRIEST EDU', icon: path.join(ROOT, 'dist', 'logo-512.png'),
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

function openHostedRoleApp() {
  createWindow()
  const target = new URL('/cbt', CLOUD_ORIGIN)
  target.searchParams.set('appRole', DESKTOP_ROLE.toLowerCase())
  win.loadURL(target.toString())
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
    configureAutoUpdates()
    if (['Admin', 'Teacher', 'Student'].includes(DESKTOP_ROLE)) {
      config.mode = 'cloud'
      openHostedRoleApp()
    } else {
      if (!config.mode && !chooseMode()) { app.quit(); return }
      if (config.mode === 'server') void openServerMode(); else openStudentMode()
    }
    void checkForUpdates()
  })
  app.on('window-all-closed', () => app.quit())
}
