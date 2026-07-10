import type {
  AppendChunkRequest,
  AppendChunkResult,
  AppInfo,
  CancelExportResult,
  CaptureSource,
  ExportMp4Request,
  ExportMp4Result,
  ExportProgressEvent,
  ListSourcesRequest,
  PermissionStatus,
  RecordingStatus,
  StartRecordingRequest,
  StartRecordingResult,
  StopRecordingResult,
} from '../../shared/ipc'

const browserFallback: AppInfo = {
  name: 'Screen Flow',
  version: '0.1.0',
  runtime: 'browser',
  platform: 'web',
}

const browserPermission: PermissionStatus = {
  screen: 'unsupported',
  message: 'Running in browser preview — Electron capture APIs are unavailable.',
}

const idleRecording: RecordingStatus = {
  state: 'idle',
  sourceId: null,
  startedAt: null,
  sessionDir: null,
  outputPath: null,
  bytesWritten: 0,
  chunkCount: 0,
}

/** Prefer preload bridge; fall back so Vite preview still works without Electron. */
export async function fetchAppInfo(): Promise<AppInfo> {
  if (window.screenFlow?.getAppInfo) {
    return window.screenFlow.getAppInfo()
  }
  return browserFallback
}

export async function fetchPermissionStatus(): Promise<PermissionStatus> {
  if (window.screenFlow?.getPermissionStatus) {
    return window.screenFlow.getPermissionStatus()
  }
  return browserPermission
}

export async function fetchCaptureSources(
  request: ListSourcesRequest = { thumbnails: true },
): Promise<CaptureSource[]> {
  if (window.screenFlow?.listSources) {
    return window.screenFlow.listSources(request)
  }
  return []
}

export async function fetchRecordingStatus(): Promise<RecordingStatus> {
  if (window.screenFlow?.getRecordingStatus) {
    return window.screenFlow.getRecordingStatus()
  }
  return { ...idleRecording }
}

export async function startRecording(
  request: StartRecordingRequest,
): Promise<StartRecordingResult> {
  if (!window.screenFlow?.startRecording) {
    throw new Error('Recording requires the Electron app')
  }
  return window.screenFlow.startRecording(request)
}

export async function stopRecording(): Promise<StopRecordingResult> {
  if (!window.screenFlow?.stopRecording) {
    throw new Error('Recording requires the Electron app')
  }
  return window.screenFlow.stopRecording()
}

export async function appendRecordingChunk(
  request: AppendChunkRequest,
): Promise<AppendChunkResult> {
  if (!window.screenFlow?.appendRecordingChunk) {
    throw new Error('Recording requires the Electron app')
  }
  return window.screenFlow.appendRecordingChunk(request)
}

export async function exportWebmToMp4(request: ExportMp4Request): Promise<ExportMp4Result> {
  if (!window.screenFlow?.exportWebmToMp4) {
    throw new Error('Export requires the Electron app')
  }
  return window.screenFlow.exportWebmToMp4(request)
}

export function onExportProgress(
  listener: (event: ExportProgressEvent) => void,
): () => void {
  if (!window.screenFlow?.onExportProgress) {
    return () => undefined
  }
  return window.screenFlow.onExportProgress(listener)
}

export async function cancelExport(): Promise<CancelExportResult> {
  if (!window.screenFlow?.cancelExport) {
    throw new Error('Export cancel requires the Electron app')
  }
  return window.screenFlow.cancelExport()
}

export function isElectronBridgeAvailable(): boolean {
  return Boolean(window.screenFlow)
}

export function isExportCancelledError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('EXPORT_CANCELLED')
}
