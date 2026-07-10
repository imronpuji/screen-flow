import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getScreenPermissionStatus, listCaptureSources } from './capture/index.js'
import {
  cancelExport,
  exportWebmToMp4,
  ExportCancelledError,
  onExportProgress,
} from './ffmpeg/transcode.js'
import {
  appendRecordingChunk,
  getRecordingStatus,
  startRecording,
  stopRecording,
} from './recording/session.js'
import {
  IPC_CHANNELS,
  type AppendChunkRequest,
  type AppInfo,
  type ExportMp4Request,
  type ListSourcesRequest,
  type StartRecordingRequest,
} from '../shared/ipc.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// In packaged builds, dist-electron/ sits next to dist/.
const isDev = !app.isPackaged

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'Screen Flow',
    backgroundColor: '#0f1419',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173'
    void win.loadURL(devUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.APP_GET_INFO, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    runtime: 'electron',
    platform: process.platform,
  }))

  ipcMain.handle(IPC_CHANNELS.APP_GET_PLATFORM, (): AppInfo['platform'] => process.platform)

  ipcMain.handle(IPC_CHANNELS.PERMISSION_GET_STATUS, () => getScreenPermissionStatus())

  ipcMain.handle(IPC_CHANNELS.SOURCES_LIST, (_event, request?: ListSourcesRequest) =>
    listCaptureSources(request ?? {}),
  )

  ipcMain.handle(IPC_CHANNELS.RECORDING_GET_STATUS, () => getRecordingStatus())

  ipcMain.handle(IPC_CHANNELS.RECORDING_START, (_event, request: StartRecordingRequest) => {
    if (!request || typeof request.sourceId !== 'string') {
      throw new Error('Invalid start recording payload')
    }
    return startRecording(request)
  })

  ipcMain.handle(IPC_CHANNELS.RECORDING_STOP, () => stopRecording())

  ipcMain.handle(IPC_CHANNELS.RECORDING_APPEND_CHUNK, (_event, request: AppendChunkRequest) => {
    if (!request || request.data == null) {
      throw new Error('Invalid append chunk payload')
    }
    return appendRecordingChunk(request)
  })

  ipcMain.handle(IPC_CHANNELS.EXPORT_WEBM_TO_MP4, async (_event, request: ExportMp4Request) => {
    if (!request || typeof request.inputPath !== 'string' || !request.inputPath.trim()) {
      throw new Error('Invalid export payload: inputPath required')
    }
    if (request.outputPath != null && typeof request.outputPath !== 'string') {
      throw new Error('Invalid export payload: outputPath must be a string')
    }
    if (request.cleanupTemp != null && typeof request.cleanupTemp !== 'boolean') {
      throw new Error('Invalid export payload: cleanupTemp must be a boolean')
    }
    try {
      return await exportWebmToMp4(request)
    } catch (err) {
      if (err instanceof ExportCancelledError) {
        // Structured cancel so renderer can distinguish from hard failures.
        throw new Error('EXPORT_CANCELLED', { cause: err })
      }
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.EXPORT_CANCEL, () => cancelExport())
}

function broadcastExportProgress(): void {
  onExportProgress((event) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.EXPORT_PROGRESS, event)
      }
    }
  })
}

app.whenReady().then(() => {
  registerIpc()
  broadcastExportProgress()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
