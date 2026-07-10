/**
 * Typed IPC contract between Electron main and renderer.
 * Keep channel names and payloads in sync — preload only exposes these.
 */

import type { CaptureGeometry } from './cursorCoords.js'
import type { AutoZoomOptions } from './autozoom.js'
import type { BackgroundStyle } from './background.js'
import type { CameraOverlayStyle } from './camera.js'
import type { CursorAppearance } from './cursorAppearance.js'
import type { CursorEvent } from './cursor.js'
import type { CursorSmoothingOptions } from './cursorSmoothing.js'
import type { TrimRange } from './edit.js'
import type { ExportQualityId } from './exportQuality.js'
import type { ZoomPointOverride } from './zoomPoints.js'

export const IPC_CHANNELS = {
  APP_GET_INFO: 'app:get-info',
  APP_GET_PLATFORM: 'app:get-platform',
  PERMISSION_GET_STATUS: 'permission:get-status',
  /** Ask macOS TCC for camera (FaceTime) before getUserMedia. */
  PERMISSION_REQUEST_CAMERA: 'permission:request-camera',
  SOURCES_LIST: 'sources:list',
  RECORDING_START: 'recording:start',
  RECORDING_STOP: 'recording:stop',
  RECORDING_GET_STATUS: 'recording:get-status',
  RECORDING_APPEND_CHUNK: 'recording:append-chunk',
  EXPORT_WEBM_TO_MP4: 'export:webm-to-mp4',
  /** Main → renderer push while ffmpeg encodes. */
  EXPORT_PROGRESS: 'export:progress',
  EXPORT_CANCEL: 'export:cancel',
  /** Copy finished temp MP4 to a user path (Save As → Documents/Screen Flow). */
  EXPORT_SAVE: 'export:save',
  /** Read cursor JSONL from a session temp path (for auto-zoom preview). */
  RECORDING_READ_CURSOR_EVENTS: 'recording:read-cursor-events',
  /** Return a screenflow-media:// URL for a temp capture file (WebM/MP4 playback). */
  RECORDING_GET_MEDIA_URL: 'recording:get-media-url',
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

export interface CameraAccessResult {
  ok: boolean
  /** macOS TCC camera status after askForMediaAccess (or unsupported). */
  status: PermissionState
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
  /** Parallel FaceTime/webcam WebM (null when camera off or idle). */
  cameraOutputPath: string | null
  cameraBytesWritten: number
  cameraChunkCount: number
  /** JSONL cursor trail for auto-zoom (null when idle or sampler inactive). */
  cursorEventsPath: string | null
  cursorEventCount: number
  /** capture-geometry.json for Retina/multi-monitor cursor→frame mapping. */
  captureGeometryPath: string | null
}

export interface StartRecordingRequest {
  sourceId: string
  /** When true, main opens a sibling camera.webm writer (renderer streams webcam chunks). */
  includeCamera?: boolean
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
  /** Parallel webcam WebM (null if camera was off or no chunks). */
  cameraOutputPath: string | null
  cameraBytesWritten: number
  cameraChunkCount: number
  /** Cursor JSONL path (null if no events captured). */
  cursorEventsPath: string | null
  cursorEventCount: number
  /** Display DIP geometry written at session start (null if unavailable). */
  captureGeometryPath: string | null
}

/** Which MediaRecorder stream a chunk belongs to. */
export type RecordingTrack = 'screen' | 'camera'

/** Binary chunk from renderer MediaRecorder → main temp writer. */
export interface AppendChunkRequest {
  /**
   * Raw MediaRecorder blob bytes (typically WebM cluster fragments).
   * Electron IPC may deliver ArrayBuffer or a Node Buffer view.
   */
  data: ArrayBuffer | Uint8Array
  /** Default `screen`. Camera track writes to session camera.webm. */
  track?: RecordingTrack
}

export interface AppendChunkResult {
  ok: true
  bytesWritten: number
  chunkCount: number
  /** Echo of the track that was written. */
  track: RecordingTrack
}

/** Bake auto-zoom from cursor JSONL during ffmpeg export (matches preview engine). */
export interface ExportAutoZoomRequest {
  /** Absolute path to cursor-events.jsonl under screen-flow temp. */
  cursorEventsPath: string
  /** Optional timing overrides (defaults match preview). */
  options?: AutoZoomOptions
  /** Per-click enable/disable + peak scale (matches review editor). */
  zoomOverrides?: ZoomPointOverride[]
}

/** Bake aesthetic background frame during ffmpeg export (matches preview). */
export interface ExportBackgroundRequest {
  style: BackgroundStyle
}

/** Bake smoothed cursor + click rings during ffmpeg export (matches preview). */
export interface ExportCursorSmoothingRequest {
  /** Absolute path to cursor-events.jsonl under screen-flow temp. */
  cursorEventsPath: string
  options?: CursorSmoothingOptions
  /** Size / style / hide / spotlight — applied at composite time. */
  appearance?: CursorAppearance
}

/** Bake FaceTime/webcam bubble during ffmpeg export (matches live overlay layout). */
export interface ExportCameraOverlayRequest {
  /** Absolute path to session camera.webm under screen-flow temp. */
  cameraPath: string
  style: CameraOverlayStyle
}

/** Trim window baked into export (matches review sliders). */
export type ExportTrimRequest = TrimRange

/** Transcode a finished temp WebM (under screen-flow temp) to H.264 MP4 via ffmpeg. */
export interface ExportMp4Request {
  /** Absolute path to capture.webm from StopRecordingResult.outputPath. */
  inputPath: string
  /** Optional destination; defaults to sibling export.mp4 in the same session dir. */
  outputPath?: string
  /** Delete the source WebM after a successful encode. Default true. */
  cleanupTemp?: boolean
  /** When set, ffmpeg crops/scales per click zoom keyframes before encode. */
  autoZoom?: ExportAutoZoomRequest
  /** When set, ffmpeg composites gradient padding frame before encode. */
  background?: ExportBackgroundRequest
  /** When set, ffmpeg draws smoothed cursor + click rings before encode. */
  cursorSmoothing?: ExportCursorSmoothingRequest
  /** When set, ffmpeg overlays camera.webm as a corner bubble before encode. */
  camera?: ExportCameraOverlayRequest
  /** When set, ffmpeg -ss/-to trims before encode (auto-zoom events re-based to trim start). */
  trim?: ExportTrimRequest
  /** Encode quality preset (draft | good | high). Default good. */
  quality?: ExportQualityId
}

export interface ExportMp4Result {
  ok: true
  outputPath: string
  bytesWritten: number
  /** Encoder used: h264_videotoolbox | libx264 */
  codec: string
  /** Quality preset applied during encode. */
  quality?: ExportQualityId
  /** True when auto-zoom sendcmd filter was applied. */
  autoZoomApplied?: boolean
  /** True when background gradient frame was composited. */
  backgroundApplied?: boolean
  /** True when cursor smoothing overlay was drawn. */
  cursorApplied?: boolean
  /** True when FaceTime/webcam bubble was composited. */
  cameraApplied?: boolean
  /** True when trim range was applied during encode. */
  trimApplied?: boolean
}

/** Live encode status pushed from main while ffmpeg runs. */
export type ExportProgressPhase =
  | 'starting'
  | 'encoding'
  | 'done'
  | 'cancelled'
  | 'error'

export interface ExportProgressEvent {
  phase: ExportProgressPhase
  /** 0–100; best-effort from ffmpeg time/duration. */
  percent: number
  /** Decoded media time so far (seconds), when known. */
  timeSec?: number
  /** Input duration (seconds), when known from ffmpeg banner. */
  durationSec?: number
  message?: string
}

export interface CancelExportResult {
  ok: true
  /** True when an in-flight ffmpeg child was signalled. */
  cancelled: boolean
}

/** Move/copy a finished temp MP4 to a permanent location (Save As). */
export interface SaveExportRequest {
  /** Absolute path to temp export.mp4 under screen-flow temp. */
  sourcePath: string
  /**
   * Optional absolute destination. When omitted, main shows a Save dialog
   * defaulting to Documents/Screen Flow/ScreenFlow-….mp4.
   */
  destinationPath?: string
  /** Suggested file name for the dialog (basename only). */
  defaultFileName?: string
  /** Delete the temp MP4 (and empty session dir) after a successful copy. Default true. */
  cleanupSource?: boolean
}

export interface ReadCursorEventsRequest {
  /** Absolute path to cursor-events.jsonl under screen-flow temp. */
  eventsPath: string
}

export interface ReadCursorEventsResult {
  ok: true
  events: CursorEvent[]
  /** Display DIP geometry sibling of the JSONL (null if missing / legacy session). */
  geometry?: CaptureGeometry | null
}

export interface GetMediaUrlRequest {
  /** Absolute path to capture.webm or export.mp4 under screen-flow temp. */
  filePath: string
}

export interface GetMediaUrlResult {
  ok: true
  url: string
}

export type SaveExportResult =
  | {
      ok: true
      cancelled: false
      outputPath: string
      bytesWritten: number
    }
  | {
      ok: true
      cancelled: true
    }

export interface ScreenFlowApi {
  getAppInfo: () => Promise<AppInfo>
  getPlatform: () => Promise<AppInfo['platform']>
  getPermissionStatus: () => Promise<PermissionStatus>
  /** Prompt macOS Camera TCC (no-op / granted on other platforms). */
  requestCameraAccess: () => Promise<CameraAccessResult>
  listSources: (request?: ListSourcesRequest) => Promise<CaptureSource[]>
  startRecording: (request: StartRecordingRequest) => Promise<StartRecordingResult>
  stopRecording: () => Promise<StopRecordingResult>
  getRecordingStatus: () => Promise<RecordingStatus>
  appendRecordingChunk: (request: AppendChunkRequest) => Promise<AppendChunkResult>
  exportWebmToMp4: (request: ExportMp4Request) => Promise<ExportMp4Result>
  /** Subscribe to encode progress; returns unsubscribe. */
  onExportProgress: (listener: (event: ExportProgressEvent) => void) => () => void
  cancelExport: () => Promise<CancelExportResult>
  saveExport: (request: SaveExportRequest) => Promise<SaveExportResult>
  readCursorEvents: (request: ReadCursorEventsRequest) => Promise<ReadCursorEventsResult>
  getMediaUrl: (request: GetMediaUrlRequest) => Promise<GetMediaUrlResult>
}

declare global {
  interface Window {
    screenFlow?: ScreenFlowApi
  }
}

export {}
