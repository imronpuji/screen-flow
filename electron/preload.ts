import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type AppInfo, type ScreenFlowApi } from '../shared/ipc.js'

const api: ScreenFlowApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_INFO) as Promise<AppInfo>,
  getPlatform: () =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_GET_PLATFORM) as Promise<AppInfo['platform']>,
}

contextBridge.exposeInMainWorld('screenFlow', api)
