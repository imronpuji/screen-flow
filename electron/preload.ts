import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type AppendChunkRequest,
  type AppendChunkResult,
  type AppInfo,
  type CancelExportResult,
  type CaptureSource,
  type ExportMp4Request,
  type ExportMp4Result,
  type ExportProgressEvent,
  type GetMediaUrlRequest,
  type GetMediaUrlResult,
  type ListSourcesRequest,
  type PermissionStatus,
  type ReadCursorEventsRequest,
  type ReadCursorEventsResult,
  type RecordingStatus,
  type SaveExportRequest,
  type SaveExportResult,
  type ScreenFlowApi,
  type StartRecordingRequest,
  type StartRecordingResult,
  type StopRecordingResult,
  type CameraAccessResult,
} from '../shared/ipc.js'

const api: ScreenFlowApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_INFO) as Promise<AppInfo>,
  getPlatform: () =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_GET_PLATFORM) as Promise<AppInfo['platform']>,
  getPermissionStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_GET_STATUS) as Promise<PermissionStatus>,
  requestCameraAccess: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_REQUEST_CAMERA) as Promise<CameraAccessResult>,
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
  exportWebmToMp4: (request: ExportMp4Request) =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_WEBM_TO_MP4, request) as Promise<ExportMp4Result>,
  onExportProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ExportProgressEvent) => {
      listener(payload)
    }
    ipcRenderer.on(IPC_CHANNELS.EXPORT_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.EXPORT_PROGRESS, handler)
    }
  },
  cancelExport: () =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_CANCEL) as Promise<CancelExportResult>,
  saveExport: (request: SaveExportRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_SAVE, request) as Promise<SaveExportResult>,
  readCursorEvents: (request: ReadCursorEventsRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.RECORDING_READ_CURSOR_EVENTS,
      request,
    ) as Promise<ReadCursorEventsResult>,
  getMediaUrl: (request: GetMediaUrlRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.RECORDING_GET_MEDIA_URL, request) as Promise<GetMediaUrlResult>,
}

contextBridge.exposeInMainWorld('screenFlow', api)
