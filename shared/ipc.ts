/**
 * Typed IPC contract between Electron main and renderer.
 * Keep channel names and payloads in sync — preload only exposes these.
 */

export const IPC_CHANNELS = {
  APP_GET_INFO: 'app:get-info',
  APP_GET_PLATFORM: 'app:get-platform',
  PERMISSION_GET_STATUS: 'permission:get-status',
  SOURCES_LIST: 'sources:list',
  RECORDING_START: 'recording:start',
  RECORDING_STOP: 'recording:stop',
  RECORDING_GET_STATUS: 'recording:get-status',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

export type AppPlatform = 'darwin' | 'win32' | 'linux' | 'web' | string

export interface AppInfo {
  name: string
  version: string
  /** electron | browser — renderer can degrade gracefully outside Electron */
  runtime: 'electron' | 'browser'
  platform: AppPlatform
}

/** Screen Recording (TCC) / capture permission probe result. */
export type PermissionState =
  | 'granted'
  | 'denied'
  | 'not-determined'
  | 'restricted'
  | 'unknown'
  | 'unsupported'

export interface PermissionStatus {
  screen: PermissionState
  /** Human-readable hint for the UI when access is missing. */
  message: string
}

export type CaptureSourceKind = 'screen' | 'window'

export interface CaptureSource {
  id: string
  name: string
  kind: CaptureSourceKind
  /** Optional JPEG data URL thumbnail from desktopCapturer. */
  thumbnailDataUrl?: string
}

export interface ListSourcesRequest {
  /** Include window thumbnails (heavier). Default true for picker UX. */
  thumbnails?: boolean
}

export type RecordingState = 'idle' | 'recording'

export interface RecordingStatus {
  state: RecordingState
  sourceId: string | null
  startedAt: number | null
}

export interface StartRecordingRequest {
  sourceId: string
}

export interface StartRecordingResult {
  ok: true
  status: RecordingStatus
}

export interface StopRecordingResult {
  ok: true
  status: RecordingStatus
  /** Stub duration until real encode lands. */
  durationMs: number
}

export interface ScreenFlowApi {
  getAppInfo: () => Promise<AppInfo>
  getPlatform: () => Promise<AppInfo['platform']>
  getPermissionStatus: () => Promise<PermissionStatus>
  listSources: (request?: ListSourcesRequest) => Promise<CaptureSource[]>
  startRecording: (request: StartRecordingRequest) => Promise<StartRecordingResult>
  stopRecording: () => Promise<StopRecordingResult>
  getRecordingStatus: () => Promise<RecordingStatus>
}

declare global {
  interface Window {
    screenFlow?: ScreenFlowApi
  }
}

export {}
