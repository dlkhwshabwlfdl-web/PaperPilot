import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { PaperPilotService } from './paperpilot'
import { loadSettings, saveSettings, type StudioSettings } from './settings'

let settings: StudioSettings = loadSettings()
const service = new PaperPilotService(settings)

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#202020',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.paperpilot.studio')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // --- window controls (frameless Fluent chrome) ---
  ipcMain.on('win:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('win:maximize', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (w) {
      if (w.isMaximized()) w.unmaximize()
      else w.maximize()
    }
  })
  ipcMain.on('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())

  // --- PaperPilot core bridge ---
  ipcMain.handle('tools:list', () => service.listTools())
  ipcMain.handle('tools:call', (_e, name: string, args: Record<string, unknown>) =>
    service.callTool(name, args)
  )
  ipcMain.handle('pp:status', () => service.status())
  ipcMain.handle('pp:backups', () => service.listBackups())
  ipcMain.handle('pp:audit', (_e, limit?: number) => service.readAudit(limit ?? 200))

  // --- settings ---
  ipcMain.handle('settings:get', () => settings)
  ipcMain.handle('settings:set', (_e, next: StudioSettings) => {
    settings = saveSettings({ ...settings, ...next })
    service.updateSettings(settings)
    return settings
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
