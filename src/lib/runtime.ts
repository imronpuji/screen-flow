import type {
  AppInfo,
  CaptureSource,
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
  return { state: 'idle', sourceId: null, startedAt: null }
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

export function isElectronBridgeAvailable(): boolean {
  return Boolean(window.screenFlow)
}
