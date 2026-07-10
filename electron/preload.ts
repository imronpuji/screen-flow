import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type AppendChunkRequest,
  type AppendChunkResult,
  type AppInfo,
  type CaptureSource,
  type ListSourcesRequest,
  type PermissionStatus,
  type RecordingStatus,
  type ScreenFlowApi,
  type StartRecordingRequest,
  type StartRecordingResult,
  type StopRecordingResult,
} from '../shared/ipc.js'

const api: ScreenFlowApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_INFO) as Promise<AppInfo>,
  getPlatform: () =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_GET_PLATFORM) as Promise<AppInfo['platform']>,
  getPermissionStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_GET_STATUS) as Promise<PermissionStatus>,
  listSources: (request?: ListSourcesRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.SOURCES_LIST, request) as Promise<CaptureSource[]>,
  startRecording: (request: StartRecordingRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.RECORDING_START, request) as Promise<StartRecordingResult>,
  stopRecording: () =>
    ipcRenderer.invoke(IPC_CHANNELS.RECORDING_STOP) as Promise<StopRecordingResult>,
  getRecordingStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.RECORDING_GET_STATUS) as Promise<RecordingStatus>,
  appendRecordingChunk: (request: AppendChunkRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.RECORDING_APPEND_CHUNK,
      request,
    ) as Promise<AppendChunkResult>,
}

contextBridge.exposeInMainWorld('screenFlow', api)
