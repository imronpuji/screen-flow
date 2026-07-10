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
  RECORDING_APPEND_CHUNK: 'recording:append-chunk',
  EXPORT_WEBM_TO_MP4: 'export:webm-to-mp4',
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
  /** Include source thumbnails (heavier). Default true for picker UX. */
  thumbnails?: boolean
}

export type RecordingState = 'idle' | 'recording'

export interface RecordingStatus {
  state: RecordingState
  sourceId: string | null
  startedAt: number | null
  /** Temp session folder under app temp (null when idle). */
  sessionDir: string | null
  /** Growing capture container path (WebM from MediaRecorder). */
  outputPath: string | null
  bytesWritten: number
  chunkCount: number
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
  durationMs: number
  /** Final WebM path written during the session (null if no chunks). */
  outputPath: string | null
  bytesWritten: number
  chunkCount: number
}

/** Binary chunk from renderer MediaRecorder → main temp writer. */
export interface AppendChunkRequest {
  /**
   * Raw MediaRecorder blob bytes (typically WebM cluster fragments).
   * Electron IPC may deliver ArrayBuffer or a Node Buffer view.
   */
  data: ArrayBuffer | Uint8Array
}

export interface AppendChunkResult {
  ok: true
  bytesWritten: number
  chunkCount: number
}

/** Transcode a finished temp WebM (under screen-flow temp) to H.264 MP4 via ffmpeg. */
export interface ExportMp4Request {
  /** Absolute path to capture.webm from StopRecordingResult.outputPath. */
  inputPath: string
  /** Optional destination; defaults to sibling export.mp4 in the same session dir. */
  outputPath?: string
  /** Delete the source WebM after a successful encode. Default true. */
  cleanupTemp?: boolean
}

export interface ExportMp4Result {
  ok: true
  outputPath: string
  bytesWritten: number
  /** Encoder used: h264_videotoolbox | libx264 */
  codec: string
}

export interface ScreenFlowApi {
  getAppInfo: () => Promise<AppInfo>
  getPlatform: () => Promise<AppInfo['platform']>
  getPermissionStatus: () => Promise<PermissionStatus>
  listSources: (request?: ListSourcesRequest) => Promise<CaptureSource[]>
  startRecording: (request: StartRecordingRequest) => Promise<StartRecordingResult>
  stopRecording: () => Promise<StopRecordingResult>
  getRecordingStatus: () => Promise<RecordingStatus>
  appendRecordingChunk: (request: AppendChunkRequest) => Promise<AppendChunkResult>
  exportWebmToMp4: (request: ExportMp4Request) => Promise<ExportMp4Result>
}

declare global {
  interface Window {
    screenFlow?: ScreenFlowApi
  }
}

export {}
