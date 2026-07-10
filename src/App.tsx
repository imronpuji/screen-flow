import { useEffect, useRef, useState } from 'react'
import type {
  AppInfo,
  CaptureSource,
  ExportProgressEvent,
  PermissionStatus,
  RecordingStatus,
} from '../shared/ipc'
import type { ReviewEditState } from '../shared/edit'
import {
  CAMERA_BORDER_COLOR_PRESETS,
  CAMERA_SIZE_PRESETS,
  CAMERA_SNAP_PRESETS,
  applyCameraSizePreset,
  applyCameraSnapPreset,
  cameraShapeAllowsFreeAspect,
  cameraSnapPresetLabel,
  matchCameraSizePreset,
  matchCameraSnapTarget,
  normalizeCameraOverlay,
  resetCameraLayout,
  type CameraOverlayStyle,
} from '../shared/camera'
import {
  startCameraCapture,
  startLiveCapture,
  type LiveCaptureHandle,
} from './lib/captureStream'
import {
  CAMERA_INACTIVE_STATUS,
  isCameraDevicePresent,
  listCameraDevices,
  openCameraStream,
  pickCameraDeviceId,
  stopMediaStream,
  type CameraDevice,
} from './lib/cameraDevices'
import {
  appendRecordingChunk,
  cancelExport,
  ensureCameraTrack,
  exportWebmToMp4,
  fetchAppInfo,
  fetchCaptureSources,
  fetchPermissionStatus,
  fetchRecordingStatus,
  getMediaUrl,
  isElectronBridgeAvailable,
  isExportCancelledError,
  onExportProgress,
  readCursorEvents,
  requestCameraAccess,
  requestMicrophoneAccess,
  saveExport,
  setCameraActiveRanges,
  startRecording,
  stopRecording,
} from './lib/runtime'
import { CameraBubble } from './components/CameraBubble'
import { CameraLayoutMap } from './components/CameraLayoutMap'
import { CameraMonitor } from './components/CameraMonitor'
import { OnboardingOverlay } from './components/OnboardingOverlay'
import { RecordingReview } from './components/RecordingReview'
import { EmptyHint, Tooltip } from './components/Tooltip'
import { hasCompletedOnboarding } from './lib/onboarding'
import { loadCameraPrefs, saveCameraPrefs } from '../shared/cameraPrefs'
import type { CursorEvent } from '../shared/cursor'
import type { CaptureGeometry } from '../shared/cursorCoords'
import type { CameraActiveRange, CameraSyncMeta } from '../shared/cameraSync'
import {
  cameraStartLagMs,
  closeOpenCameraActiveRanges,
  openCameraActiveRange,
} from '../shared/cameraSync'
import { isEditableTarget, matchShortcut } from '../shared/shortcuts'
import {
  TOOLTIPS,
  sourcesEmptyTooltip,
  startRecordingTooltip,
} from '../shared/tooltips'
import './App.css'

type AppMode = 'setup' | 'recording' | 'review'

const idleRecording: RecordingStatus = {
  state: 'idle',
  sourceId: null,
  startedAt: null,
  sessionDir: null,
  outputPath: null,
  bytesWritten: 0,
  chunkCount: 0,
  cameraOutputPath: null,
  cameraBytesWritten: 0,
  cameraChunkCount: 0,
  cursorEventsPath: null,
  cursorEventCount: 0,
  captureGeometryPath: null,
  cameraSyncPath: null,
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [permission, setPermission] = useState<PermissionStatus | null>(null)
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [recording, setRecording] = useState<RecordingStatus>(idleRecording)
  const [mode, setMode] = useState<AppMode>('setup')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSummary, setLastSummary] = useState<string | null>(null)
  const [lastWebmPath, setLastWebmPath] = useState<string | null>(null)
  const [lastCursorEventsPath, setLastCursorEventsPath] = useState<string | null>(null)
  const [lastCameraPath, setLastCameraPath] = useState<string | null>(null)
  const [lastCameraSyncPath, setLastCameraSyncPath] = useState<string | null>(null)
  const [cameraSync, setCameraSync] = useState<CameraSyncMeta | null>(null)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [playbackCameraUrl, setPlaybackCameraUrl] = useState<string | null>(null)
  const [playbackCursorEvents, setPlaybackCursorEvents] = useState<CursorEvent[]>([])
  const [captureGeometry, setCaptureGeometry] = useState<CaptureGeometry | null>(null)
  const [reviewDurationMs, setReviewDurationMs] = useState(0)
  const [reviewBytesWritten, setReviewBytesWritten] = useState(0)
  const [reviewChunkCount, setReviewChunkCount] = useState(0)
  const [reviewCursorEventCount, setReviewCursorEventCount] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<ExportProgressEvent | null>(null)
  const [cameraOverlay, setCameraOverlay] = useState<CameraOverlayStyle>(() => loadCameraPrefs())
  const [cameraDevices, setCameraDevices] = useState<CameraDevice[]>([])
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [micNote, setMicNote] = useState<string | null>(null)
  const [micLive, setMicLive] = useState(false)
  /** Live FaceTime arm during an active recording (mute/unmute without stopping MediaRecorder). */
  const [cameraLive, setCameraLive] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => !hasCompletedOnboarding())
  const previewRef = useRef<HTMLVideoElement | null>(null)
  const captureRef = useRef<LiveCaptureHandle | null>(null)
  const cameraCaptureRef = useRef<LiveCaptureHandle | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const cameraOverlayRef = useRef(cameraOverlay)
  const isRecordingRef = useRef(false)
  const cameraIntentionalStopRef = useRef(false)
  const cameraActiveRangesRef = useRef<CameraActiveRange[]>([])
  const recordingStartedAtRef = useRef<number | null>(null)
  const toggleRecordingRef = useRef<() => void>(() => undefined)
  const enableCameraPreviewRef = useRef<(next: CameraOverlayStyle) => Promise<void>>(
    async () => undefined,
  )
  const refreshCameraDevicesRef = useRef<
    (options?: { reopenIfLost?: boolean }) => Promise<void>
  >(async () => undefined)
  const handleCameraTrackEndedRef = useRef<() => void>(() => undefined)

  const inElectron = isElectronBridgeAvailable()
  const isRecording = mode === 'recording' || recording.state === 'recording'
  const canRecord =
    inElectron && !busy && mode !== 'review' && Boolean(selectedSourceId) && permission?.screen !== 'denied'

  cameraOverlayRef.current = cameraOverlay
  isRecordingRef.current = isRecording

  useEffect(() => {
    return onExportProgress((event) => {
      setExportProgress(event)
    })
  }, [])

  // Persist FaceTime layout/device/chrome so the next launch matches last setup/review.
  useEffect(() => {
    saveCameraPrefs(cameraOverlay)
  }, [cameraOverlay])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const [nextInfo, nextPermission, nextRecording] = await Promise.all([
          fetchAppInfo(),
          fetchPermissionStatus(),
          fetchRecordingStatus(),
        ])
        if (cancelled) return
        setInfo(nextInfo)
        setPermission(nextPermission)
        setRecording(nextRecording)
        if (nextRecording.state === 'recording') {
          setMode('recording')
        }

        if (isElectronBridgeAvailable()) {
          const nextSources = await fetchCaptureSources({ thumbnails: true })
          if (cancelled) return
          setSources(nextSources)
          setSelectedSourceId((prev) => {
            if (prev && nextSources.some((s) => s.id === prev)) return prev
            const preferred =
              nextSources.find((s) => s.kind === 'screen') ?? nextSources[0] ?? null
            return preferred?.id ?? null
          })
        }

        try {
          const devices = await listCameraDevices()
          if (!cancelled) setCameraDevices(devices)
        } catch {
          /* camera enumerate is best-effort before permission */
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to initialize capture UI')
        }
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      void captureRef.current?.stop()
      captureRef.current = null
      void cameraCaptureRef.current?.stop()
      cameraCaptureRef.current = null
      cameraIntentionalStopRef.current = true
      stopMediaStream(cameraStreamRef.current)
      cameraStreamRef.current = null
    }
  }, [])

  async function refreshCameraDevices(options?: { reopenIfLost?: boolean }) {
    try {
      const devices = await listCameraDevices()
      setCameraDevices(devices)
      const prev = cameraOverlayRef.current
      const nextId = pickCameraDeviceId(devices, prev.deviceId)
      const lost =
        Boolean(prev.deviceId) && !isCameraDevicePresent(devices, prev.deviceId)
      if (nextId !== prev.deviceId) {
        setCameraOverlay((cur) =>
          normalizeCameraOverlay({
            ...cur,
            deviceId: nextId,
          }),
        )
      }
      // Hot-plug: if the armed camera vanished, reopen on the fallback (setup only).
      if (
        options?.reopenIfLost &&
        lost &&
        prev.enabled &&
        !isRecordingRef.current &&
        nextId
      ) {
        void enableCameraPreviewRef.current(
          normalizeCameraOverlay({ ...prev, deviceId: nextId, enabled: true }),
        )
      } else if (options?.reopenIfLost && lost && prev.enabled && !nextId) {
        cameraIntentionalStopRef.current = true
        stopMediaStream(cameraStreamRef.current)
        cameraStreamRef.current = null
        setCameraStream(null)
        setMicLive(false)
        setMicNote(null)
        setCameraOverlay((cur) => normalizeCameraOverlay({ ...cur, enabled: false }))
        setCameraError(CAMERA_INACTIVE_STATUS)
      }
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Failed to list cameras')
    }
  }

  /** Soft-fail when the live FaceTime track ends (unplug / Continuity drop). */
  function handleCameraTrackEnded() {
    if (cameraIntentionalStopRef.current) return
    const stream = cameraStreamRef.current
    const stillLive = stream
      ?.getVideoTracks()
      .some((t) => t.readyState === 'live')
    if (stillLive) return

    if (isRecordingRef.current) {
      setCameraTracksEnabled(false)
      const ranges = closeOpenCameraActiveRanges(
        cameraActiveRangesRef.current,
        wallOffsetMs(),
      )
      void syncCameraActiveRanges(ranges)
      setCameraLive(false)
      setMicLive(false)
      setCameraError(CAMERA_INACTIVE_STATUS)
      return
    }

    cameraIntentionalStopRef.current = true
    stopMediaStream(cameraStreamRef.current)
    cameraStreamRef.current = null
    setCameraStream(null)
    setMicLive(false)
    setMicNote(null)
    setCameraOverlay((prev) => normalizeCameraOverlay({ ...prev, enabled: false }))
    setCameraError(CAMERA_INACTIVE_STATUS)
    void refreshCameraDevices()
  }

  async function enableCameraPreview(next: CameraOverlayStyle) {
    setCameraError(null)
    setMicNote(null)
    try {
      const access = await requestCameraAccess()
      if (!access.ok) {
        throw new Error(access.message)
      }
      const wantMic = next.micEnabled !== false
      if (wantMic) {
        // Non-fatal — openCameraStream falls back to video-only if mic is denied.
        await requestMicrophoneAccess()
      }
      const opened = await openCameraStream(next.deviceId, { includeMic: wantMic })
      const liveTracks = opened.stream.getVideoTracks().filter((t) => t.readyState === 'live')
      if (liveTracks.length === 0) {
        stopMediaStream(opened.stream)
        throw new Error(
          'Camera opened but no live video track. Check System Settings → Privacy & Security → Camera.',
        )
      }
      cameraIntentionalStopRef.current = true
      stopMediaStream(cameraStreamRef.current)
      cameraStreamRef.current = opened.stream
      cameraIntentionalStopRef.current = false
      setCameraStream(opened.stream)
      setMicLive(opened.micActive)
      setMicNote(opened.micNote)
      setCameraError(null)
      await refreshCameraDevices()
      setCameraOverlay(
        normalizeCameraOverlay({
          ...next,
          enabled: true,
          micEnabled: wantMic,
        }),
      )
    } catch (err) {
      cameraIntentionalStopRef.current = true
      stopMediaStream(cameraStreamRef.current)
      cameraStreamRef.current = null
      setCameraStream(null)
      setMicLive(false)
      setMicNote(null)
      setCameraOverlay(normalizeCameraOverlay({ ...next, enabled: false }))
      setCameraError(err instanceof Error ? err.message : 'Camera unavailable')
    }
  }

  useEffect(() => {
    enableCameraPreviewRef.current = enableCameraPreview
  })

  useEffect(() => {
    refreshCameraDevicesRef.current = refreshCameraDevices
  })

  useEffect(() => {
    handleCameraTrackEndedRef.current = handleCameraTrackEnded
  })

  // Returning users who left the camera armed: reopen preview after prefs load.
  useEffect(() => {
    const prefs = loadCameraPrefs()
    if (!prefs.enabled) return
    void enableCameraPreviewRef.current(prefs)
  }, [])

  function disableCameraPreview() {
    void cameraCaptureRef.current?.stop()
    cameraCaptureRef.current = null
    cameraIntentionalStopRef.current = true
    stopMediaStream(cameraStreamRef.current)
    cameraStreamRef.current = null
    setCameraStream(null)
    setCameraLive(false)
    setMicLive(false)
    setMicNote(null)
    setCameraOverlay((prev) => normalizeCameraOverlay({ ...prev, enabled: false }))
    setCameraError(null)
  }

  function wallOffsetMs(): number {
    const started = recordingStartedAtRef.current
    if (started == null) return 0
    return Math.max(0, Date.now() - started)
  }

  function setCameraTracksEnabled(enabled: boolean) {
    const stream = cameraStreamRef.current
    if (!stream) return
    // Mute video + mic together so FaceTime A/V stay one logical track.
    for (const track of stream.getTracks()) {
      track.enabled = enabled
    }
  }

  function beginCameraCaptureTrack() {
    if (!cameraStreamRef.current) return
    if (cameraCaptureRef.current) return
    cameraCaptureRef.current = startCameraCapture({
      stream: cameraStreamRef.current,
      onChunk: async (data) => {
        const chunkResult = await appendRecordingChunk({ data, track: 'camera' })
        setRecording((prev) =>
          prev.state === 'recording'
            ? {
                ...prev,
                cameraBytesWritten: chunkResult.bytesWritten,
                cameraChunkCount: chunkResult.chunkCount,
              }
            : prev,
        )
      },
      onError: (err) => setCameraError(err.message),
    })
  }

  async function syncCameraActiveRanges(ranges: CameraActiveRange[]) {
    cameraActiveRangesRef.current = ranges
    try {
      await setCameraActiveRanges({ ranges })
    } catch {
      /* best-effort — stop still closes open ranges */
    }
  }

  /** Arm / mute FaceTime during an active recording (FOKUS 3A mid-recording toggle). */
  async function setCameraLiveDuringRecording(nextLive: boolean) {
    if (!isRecording) return
    setCameraError(null)
    try {
      if (nextLive) {
        if (!cameraStreamRef.current) {
          await enableCameraPreview(cameraOverlay)
          if (!cameraStreamRef.current) return
        }
        const ensured = await ensureCameraTrack()
        setRecording(ensured.status)
        setCameraTracksEnabled(true)
        beginCameraCaptureTrack()
        const ranges = openCameraActiveRange(cameraActiveRangesRef.current, wallOffsetMs())
        await syncCameraActiveRanges(ranges)
        setCameraLive(true)
        setCameraOverlay((prev) => normalizeCameraOverlay({ ...prev, enabled: true }))
      } else {
        setCameraTracksEnabled(false)
        const ranges = closeOpenCameraActiveRanges(
          cameraActiveRangesRef.current,
          wallOffsetMs(),
        )
        await syncCameraActiveRanges(ranges)
        setCameraLive(false)
      }
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Camera toggle failed')
      setCameraLive(false)
    }
  }

  function clearReview() {
    setMode('setup')
    setLastWebmPath(null)
    setLastCursorEventsPath(null)
    setLastCameraPath(null)
    setLastCameraSyncPath(null)
    setCameraSync(null)
    setPlaybackUrl(null)
    setPlaybackCameraUrl(null)
    setPlaybackCursorEvents([])
    setCaptureGeometry(null)
    setReviewDurationMs(0)
    setReviewBytesWritten(0)
    setReviewChunkCount(0)
    setReviewCursorEventCount(0)
    setLastSummary(null)
    setError(null)
  }

  async function refreshSources() {
    setBusy(true)
    setError(null)
    try {
      const [nextPermission, nextSources] = await Promise.all([
        fetchPermissionStatus(),
        fetchCaptureSources({ thumbnails: true }),
      ])
      setPermission(nextPermission)
      setSources(nextSources)
      setSelectedSourceId((prev) => {
        if (prev && nextSources.some((s) => s.id === prev)) return prev
        const preferred =
          nextSources.find((s) => s.kind === 'screen') ?? nextSources[0] ?? null
        return preferred?.id ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list sources')
    } finally {
      setBusy(false)
    }
  }

  function bindPreview(stream: MediaStream | null) {
    const el = previewRef.current
    if (!el) return
    el.srcObject = stream
    if (stream) {
      void el.play().catch(() => {
        /* autoplay can fail if tab is backgrounded; ignore */
      })
    }
  }

  async function onToggleRecording() {
    if (!selectedSourceId && !isRecording) return
    setBusy(true)
    setError(null)
    try {
      if (isRecording) {
        const handle = captureRef.current
        captureRef.current = null
        const cameraHandle = cameraCaptureRef.current
        cameraCaptureRef.current = null
        // Close any open mute window before stop so camera-sync.json is complete.
        const closedRanges = closeOpenCameraActiveRanges(
          cameraActiveRangesRef.current,
          wallOffsetMs(),
        )
        cameraActiveRangesRef.current = closedRanges
        try {
          await setCameraActiveRanges({ ranges: closedRanges })
        } catch {
          /* stop still finalizes */
        }
        await handle?.stop()
        await cameraHandle?.stop()
        bindPreview(null)
        const result = await stopRecording()
        recordingStartedAtRef.current = null
        setCameraLive(false)
        cameraActiveRangesRef.current = []
        setRecording(result.status)
        setLastWebmPath(result.outputPath)
        setLastCursorEventsPath(result.cursorEventsPath)
        setLastCameraPath(result.cameraOutputPath)
        setLastCameraSyncPath(result.cameraSyncPath)
        setCameraSync(result.cameraSync)
        setReviewDurationMs(result.durationMs)
        setReviewBytesWritten(result.bytesWritten)
        setReviewChunkCount(result.chunkCount)
        setReviewCursorEventCount(result.cursorEventCount)
        // Keep overlay enabled in review when a camera track was captured (even if muted at end).
        if (result.cameraChunkCount > 0) {
          setCameraOverlay((prev) => normalizeCameraOverlay({ ...prev, enabled: true }))
        }

        if (!result.outputPath) {
          setMode('setup')
          setLastSummary(`Session ${(result.durationMs / 1000).toFixed(1)}s with no video data.`)
          return
        }

        try {
          const [media, cursor, cameraMedia] = await Promise.all([
            getMediaUrl({ filePath: result.outputPath }),
            result.cursorEventsPath
              ? readCursorEvents({ eventsPath: result.cursorEventsPath })
              : Promise.resolve({
                  ok: true as const,
                  events: [] as CursorEvent[],
                  geometry: null as CaptureGeometry | null,
                }),
            result.cameraOutputPath
              ? getMediaUrl({ filePath: result.cameraOutputPath })
              : Promise.resolve(null),
          ])
          setPlaybackUrl(media.url)
          setPlaybackCameraUrl(cameraMedia?.url ?? null)
          setPlaybackCursorEvents(cursor.events)
          setCaptureGeometry(cursor.geometry ?? null)
          setMode('review')
          setLastSummary(
            [
              `Ready to review · ${(result.durationMs / 1000).toFixed(1)}s`,
              result.cameraChunkCount > 0
                ? `camera track ${formatBytes(result.cameraBytesWritten)}`
                : null,
              result.cameraSync && cameraStartLagMs(result.cameraSync) !== 0
                ? `sync ${cameraStartLagMs(result.cameraSync) > 0 ? '+' : ''}${(cameraStartLagMs(result.cameraSync) / 1000).toFixed(2)}s`
                : null,
            ]
              .filter(Boolean)
              .join(' · '),
          )
        } catch (loadErr) {
          setMode('setup')
          setError(
            loadErr instanceof Error ? loadErr.message : 'Failed to load recording preview',
          )
        }
      } else {
        clearReview()
        setMode('recording')
        const wantCamera = cameraOverlay.enabled && Boolean(cameraStreamRef.current)
        const started = await startRecording({
          sourceId: selectedSourceId!,
          includeCamera: wantCamera,
        })
        setRecording(started.status)
        recordingStartedAtRef.current = started.status.startedAt
        cameraActiveRangesRef.current = []
        setCameraLive(false)

        try {
          const handle = await startLiveCapture({
            sourceId: selectedSourceId!,
            onChunk: async (data) => {
              const chunkResult = await appendRecordingChunk({ data, track: 'screen' })
              setRecording((prev) =>
                prev.state === 'recording'
                  ? {
                      ...prev,
                      bytesWritten: chunkResult.bytesWritten,
                      chunkCount: chunkResult.chunkCount,
                    }
                  : prev,
              )
            },
            onError: (err) => setError(err.message),
          })
          captureRef.current = handle
          bindPreview(handle.stream)

          if (wantCamera && cameraStreamRef.current) {
            setCameraTracksEnabled(true)
            beginCameraCaptureTrack()
            const ranges = openCameraActiveRange([], wallOffsetMs())
            await syncCameraActiveRanges(ranges)
            setCameraLive(true)
          }
        } catch (captureErr) {
          void cameraCaptureRef.current?.stop()
          cameraCaptureRef.current = null
          recordingStartedAtRef.current = null
          setCameraLive(false)
          cameraActiveRangesRef.current = []
          try {
            await stopRecording()
          } catch {
            /* ignore */
          }
          setRecording(idleRecording)
          setMode('setup')
          throw captureErr
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recording action failed')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    toggleRecordingRef.current = () => {
      void onToggleRecording()
    }
  })

  // Hot-plug Continuity / USB cameras — refresh labels + fall back if selected device vanishes.
  useEffect(() => {
    const media = navigator.mediaDevices
    if (!media?.addEventListener) return
    const onDeviceChange = () => {
      void refreshCameraDevicesRef.current({ reopenIfLost: true })
    }
    media.addEventListener('devicechange', onDeviceChange)
    return () => {
      media.removeEventListener('devicechange', onDeviceChange)
    }
  }, [])

  // Soft-fail when FaceTime video track ends (unplug mid-preview or mid-recording).
  useEffect(() => {
    if (!cameraStream) return
    const tracks = cameraStream.getVideoTracks()
    const onEnded = () => {
      handleCameraTrackEndedRef.current()
    }
    for (const track of tracks) {
      track.addEventListener('ended', onEnded)
    }
    return () => {
      for (const track of tracks) {
        track.removeEventListener('ended', onEnded)
      }
    }
  }, [cameraStream])

  // Setup / recording shortcuts (review has its own handlers).
  useEffect(() => {
    if (mode === 'review') return
    if (showOnboarding && mode === 'setup') return

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableTarget(event.target)) return
      const context = isRecording ? 'recording' : 'setup'
      const action = matchShortcut(event, context)
      if (action !== 'toggle-record') return
      if (!isRecording && !canRecord) return
      if (busy) return
      event.preventDefault()
      toggleRecordingRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, canRecord, isRecording, mode, showOnboarding])

  async function onExportMp4(_edit: ReviewEditState) {
    if (!lastWebmPath) return
    setExporting(true)
    setExportProgress({ phase: 'starting', percent: 0 })
    setError(null)
    try {
      const exportRequest: Parameters<typeof exportWebmToMp4>[0] = {
        inputPath: lastWebmPath,
        cleanupTemp: true,
        quality: _edit.exportQuality,
        format: _edit.exportFormat,
        trim: {
          startMs: _edit.trimStartMs,
          endMs: _edit.trimEndMs,
        },
        keepRanges:
          _edit.keepRanges.length > 1
            ? _edit.keepRanges.map((r) => ({ startMs: r.startMs, endMs: r.endMs }))
            : undefined,
      }
      if (_edit.autoZoomEnabled && lastCursorEventsPath) {
        exportRequest.autoZoom = {
          cursorEventsPath: lastCursorEventsPath,
          zoomOverrides:
            _edit.zoomPointOverrides.length > 0
              ? _edit.zoomPointOverrides
              : undefined,
          manualZoomPoints:
            _edit.manualZoomPoints.length > 0
              ? _edit.manualZoomPoints
              : undefined,
        }
      }
      if (_edit.background.enabled) {
        exportRequest.background = { style: _edit.background }
      }
      if (_edit.cursorSmoothingEnabled && lastCursorEventsPath) {
        exportRequest.cursorSmoothing = {
          cursorEventsPath: lastCursorEventsPath,
          appearance: _edit.cursorAppearance,
        }
      }
      if (lastCameraPath && _edit.cameraOverlay.enabled) {
        exportRequest.camera = {
          cameraPath: lastCameraPath,
          style: _edit.cameraOverlay,
          syncPath: lastCameraSyncPath ?? undefined,
          activeRangesOverride:
            _edit.cameraActiveRangesOverride !== null
              ? _edit.cameraActiveRangesOverride
              : undefined,
        }
      }
      const result = await exportWebmToMp4(exportRequest)
      clearReview()
      setExportProgress({ phase: 'done', percent: 100, message: 'Saving…' })

      const baked: string[] = []
      if (result.trimApplied) baked.push('trim')
      if (result.autoZoomApplied) baked.push('auto-zoom')
      if (result.backgroundApplied) baked.push('background')
      if (result.cursorApplied) baked.push('cursor')
      if (result.cameraApplied) baked.push('camera')
      const bakedLabel = baked.length ? `, ${baked.join(' + ')} baked` : ''
      const formatLabel = (result.format ?? _edit.exportFormat ?? 'mp4').toUpperCase()
      const qualityLabel = result.quality ? `, ${result.quality}` : ''

      const saved = await saveExport({
        sourcePath: result.outputPath,
        cleanupSource: true,
        format: result.format ?? _edit.exportFormat,
      })
      if (saved.cancelled) {
        setLastSummary(
          `Exported ${formatLabel} (${result.codec}${qualityLabel}${bakedLabel}) · ${formatBytes(result.bytesWritten)} (not saved to Documents)`,
        )
      } else {
        setLastSummary(
          `Saved ${formatLabel} (${result.codec}${qualityLabel}${bakedLabel}) · ${formatBytes(saved.bytesWritten)} → ${saved.outputPath}`,
        )
      }
      setExportProgress({ phase: 'done', percent: 100 })
    } catch (err) {
      if (isExportCancelledError(err)) {
        setLastSummary('Export cancelled.')
        setExportProgress({ phase: 'cancelled', percent: 0 })
      } else {
        setError(err instanceof Error ? err.message : 'Export failed')
        setExportProgress(null)
      }
    } finally {
      setExporting(false)
    }
  }

  async function onCancelExport() {
    try {
      await cancelExport()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed')
    }
  }

  const selected = sources.find((s) => s.id === selectedSourceId) ?? null

  if (mode === 'review' && playbackUrl && lastWebmPath) {
    return (
      <div className="shell shell--review">
        <div className="shell__atmosphere" aria-hidden="true" />
        <header className="shell__top">
          <p className="shell__brand">Screen Flow</p>
          <p className="shell__meta">
            {info
              ? `${info.runtime} · ${info.platform} · v${info.version}`
              : 'connecting…'}
          </p>
        </header>
        <main className="shell__review-stage">
          {error ? (
            <p className="shell__status shell__status--warn shell__status--banner" role="alert">
              {error}
            </p>
          ) : null}
          <RecordingReview
            key={playbackUrl}
            mediaUrl={playbackUrl}
            webmPath={lastWebmPath}
            cursorEvents={playbackCursorEvents}
            cursorEventsPath={lastCursorEventsPath}
            captureGeometry={captureGeometry}
            cameraMediaUrl={playbackCameraUrl}
            cameraSync={cameraSync}
            initialCameraOverlay={cameraOverlay}
            onCameraOverlayChange={(style) => setCameraOverlay(normalizeCameraOverlay(style))}
            durationMs={reviewDurationMs}
            bytesWritten={reviewBytesWritten}
            chunkCount={reviewChunkCount}
            cursorEventCount={reviewCursorEventCount}
            exporting={exporting}
            exportProgress={exportProgress}
            onExport={(edit) => void onExportMp4(edit)}
            onCancelExport={() => void onCancelExport()}
            onDiscard={clearReview}
          />
        </main>
        {lastSummary ? (
          <p className="shell__status shell__status--footer" role="status">
            {lastSummary}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="shell">
      <div className="shell__atmosphere" aria-hidden="true" />
      {showOnboarding && mode === 'setup' && !isRecording ? (
        <OnboardingOverlay onDone={() => setShowOnboarding(false)} />
      ) : null}
      <header className="shell__top">
        <p className="shell__brand">Screen Flow</p>
        <p className="shell__meta">
          {info
            ? `${info.runtime} · ${info.platform} · v${info.version}`
            : 'connecting…'}
        </p>
      </header>

      <main className="shell__stage">
        <section className="shell__hero" aria-labelledby="hero-title">
          <h1 id="hero-title" className="shell__title">
            Record. Zoom. Export.
          </h1>
          <p className="shell__lede">
            Desktop screen recording with cinematic auto-zoom, cursor polish, and
            hardware-accelerated export — built for macOS first.
          </p>
          <div className="shell__actions">
            <Tooltip
              copy={startRecordingTooltip({
                isRecording,
                inElectron,
                hasSource: Boolean(selectedSourceId),
                permissionDenied: permission?.screen === 'denied',
                busy,
              })}
            >
              <button
                type="button"
                className={isRecording ? 'btn btn--danger' : 'btn btn--primary'}
                disabled={!canRecord && !isRecording}
                onClick={() => void onToggleRecording()}
              >
                {isRecording ? 'Stop recording' : 'Start recording'}
              </button>
            </Tooltip>
            <Tooltip copy={TOOLTIPS['refresh-sources']}>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!inElectron || busy || isRecording}
                onClick={() => void refreshSources()}
              >
                Refresh sources
              </button>
            </Tooltip>
          </div>
          <p className="shell__shortcuts" aria-label="Keyboard shortcuts">
            {isRecording ? (
              <>
                <kbd className="kbd">R</kbd> or <kbd className="kbd">Esc</kbd> stop
              </>
            ) : (
              <>
                <kbd className="kbd">R</kbd> or <kbd className="kbd">Space</kbd> start recording
              </>
            )}
          </p>
          {permission ? (
            <p
              className={
                permission.screen === 'denied' || permission.screen === 'unsupported'
                  ? 'shell__status shell__status--warn'
                  : 'shell__status'
              }
              role="status"
            >
              Permission: {permission.screen}. {permission.message}
            </p>
          ) : null}
          {error ? (
            <p className="shell__status shell__status--warn" role="alert">
              {error}
            </p>
          ) : null}
          <div className="camera-controls" aria-label="Camera overlay">
            <Tooltip
              copy={
                cameraOverlay.enabled && cameraDevices.length === 0
                  ? TOOLTIPS['camera-no-device']
                  : TOOLTIPS['camera-off']
              }
              block
            >
              <label className="camera-controls__toggle">
                <input
                  type="checkbox"
                  checked={isRecording ? cameraLive : cameraOverlay.enabled}
                  disabled={busy}
                  onChange={(e) => {
                    const checked = e.target.checked
                    if (isRecording) {
                      void setCameraLiveDuringRecording(checked)
                      return
                    }
                    if (checked) {
                      void enableCameraPreview(cameraOverlay)
                    } else {
                      disableCameraPreview()
                    }
                  }}
                />
                <span>
                  {isRecording
                    ? cameraLive
                      ? 'FaceTime camera (live)'
                      : 'FaceTime camera (muted)'
                    : 'FaceTime camera overlay'}
                </span>
              </label>
            </Tooltip>
            {cameraOverlay.enabled || cameraLive ? (
              <div className="camera-controls__row">
                <label className="camera-controls__field">
                  <span>Camera</span>
                  <select
                    value={cameraOverlay.deviceId ?? ''}
                    disabled={busy || isRecording || cameraDevices.length === 0}
                    onChange={(e) => {
                      const deviceId = e.target.value || null
                      void enableCameraPreview({ ...cameraOverlay, deviceId })
                    }}
                  >
                    {cameraDevices.length === 0 ? (
                      <option value="">No camera found</option>
                    ) : (
                      cameraDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="camera-controls__toggle camera-controls__toggle--inline">
                  <input
                    type="checkbox"
                    checked={cameraOverlay.micEnabled}
                    disabled={busy || isRecording}
                    onChange={(e) => {
                      const micEnabled = e.target.checked
                      void enableCameraPreview({ ...cameraOverlay, micEnabled })
                    }}
                  />
                  <span>
                    {micLive
                      ? 'Microphone (with camera)'
                      : cameraOverlay.micEnabled
                        ? 'Microphone (off — fallback)'
                        : 'Microphone'}
                  </span>
                </label>
                <label className="camera-controls__field">
                  <span>Position</span>
                  <select
                    value={matchCameraSnapTarget(cameraOverlay) ?? 'custom'}
                    disabled={busy}
                    onChange={(e) => {
                      const value = e.target.value
                      if (value === 'custom') return
                      setCameraOverlay((prev) =>
                        applyCameraSnapPreset(
                          prev,
                          value as (typeof CAMERA_SNAP_PRESETS)[number],
                        ),
                      )
                    }}
                  >
                    {matchCameraSnapTarget(cameraOverlay) == null ? (
                      <option value="custom">Custom</option>
                    ) : null}
                    {CAMERA_SNAP_PRESETS.map((t) => (
                      <option key={t} value={t}>
                        {cameraSnapPresetLabel(t)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="camera-controls__field">
                  <span>
                    {cameraOverlay.lockAspect
                      ? `Size ${cameraOverlay.sizePercent}%`
                      : `Width ${cameraOverlay.sizePercent}%`}
                  </span>
                  <input
                    type="range"
                    min={12}
                    max={40}
                    value={cameraOverlay.sizePercent}
                    disabled={busy}
                    onChange={(e) =>
                      setCameraOverlay((prev) =>
                        normalizeCameraOverlay({
                          ...prev,
                          sizePercent: Number(e.target.value),
                          heightPercent: prev.lockAspect
                            ? Number(e.target.value)
                            : prev.heightPercent,
                        }),
                      )
                    }
                  />
                </label>
                <div
                  className="camera-controls__size-presets"
                  role="group"
                  aria-label="Camera size presets"
                >
                  {CAMERA_SIZE_PRESETS.map((preset) => {
                    const active = matchCameraSizePreset(cameraOverlay) === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={`camera-controls__size-preset${
                          active ? ' camera-controls__size-preset--active' : ''
                        }`}
                        disabled={busy}
                        title={`${preset.label} · ${preset.sizePercent}% (key ${
                          preset.id === 'small' ? '1' : preset.id === 'medium' ? '2' : '3'
                        })`}
                        onClick={() =>
                          setCameraOverlay((prev) =>
                            applyCameraSizePreset(prev, preset.id),
                          )
                        }
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    className="camera-controls__size-preset"
                    disabled={busy}
                    title="Reset to bottom-right · medium (key 0 or double-click)"
                    onClick={() =>
                      setCameraOverlay((prev) => resetCameraLayout(prev))
                    }
                  >
                    Reset
                  </button>
                </div>
                {!cameraOverlay.lockAspect &&
                cameraShapeAllowsFreeAspect(cameraOverlay.shape) ? (
                  <label className="camera-controls__field">
                    <span>Height {cameraOverlay.heightPercent}%</span>
                    <input
                      type="range"
                      min={12}
                      max={40}
                      value={cameraOverlay.heightPercent}
                      disabled={busy}
                      onChange={(e) =>
                        setCameraOverlay((prev) =>
                          normalizeCameraOverlay({
                            ...prev,
                            lockAspect: false,
                            heightPercent: Number(e.target.value),
                          }),
                        )
                      }
                    />
                  </label>
                ) : null}
                <label className="camera-controls__field">
                  <span>Shape</span>
                  <select
                    value={cameraOverlay.shape}
                    disabled={busy}
                    onChange={(e) =>
                      setCameraOverlay((prev) =>
                        normalizeCameraOverlay({
                          ...prev,
                          shape: e.target.value as CameraOverlayStyle['shape'],
                        }),
                      )
                    }
                  >
                    <option value="circle">Circle</option>
                    <option value="rounded">Rounded</option>
                    <option value="rectangle">Rectangle</option>
                  </select>
                </label>
                {cameraShapeAllowsFreeAspect(cameraOverlay.shape) ? (
                  <label className="camera-controls__toggle">
                    <input
                      type="checkbox"
                      checked={cameraOverlay.lockAspect}
                      disabled={busy}
                      onChange={(e) =>
                        setCameraOverlay((prev) =>
                          normalizeCameraOverlay({
                            ...prev,
                            lockAspect: e.target.checked,
                            heightPercent: e.target.checked
                              ? prev.sizePercent
                              : prev.heightPercent,
                          }),
                        )
                      }
                    />
                    <span>Lock aspect (square)</span>
                  </label>
                ) : null}
                <label className="camera-controls__toggle">
                  <input
                    type="checkbox"
                    checked={cameraOverlay.shadowEnabled}
                    disabled={busy}
                    onChange={(e) =>
                      setCameraOverlay((prev) =>
                        normalizeCameraOverlay({
                          ...prev,
                          shadowEnabled: e.target.checked,
                        }),
                      )
                    }
                  />
                  <span>Shadow</span>
                </label>
                <label className="camera-controls__toggle">
                  <input
                    type="checkbox"
                    checked={cameraOverlay.borderEnabled}
                    disabled={busy}
                    onChange={(e) =>
                      setCameraOverlay((prev) =>
                        normalizeCameraOverlay({
                          ...prev,
                          borderEnabled: e.target.checked,
                        }),
                      )
                    }
                  />
                  <span>Outline</span>
                </label>
                <label className="camera-controls__toggle">
                  <input
                    type="checkbox"
                    checked={cameraOverlay.mirrored}
                    disabled={busy}
                    onChange={(e) =>
                      setCameraOverlay((prev) =>
                        normalizeCameraOverlay({
                          ...prev,
                          mirrored: e.target.checked,
                        }),
                      )
                    }
                  />
                  <span>Mirror</span>
                </label>
                <label className="camera-controls__field">
                  <span>Opacity {Math.round(cameraOverlay.opacity * 100)}%</span>
                  <input
                    type="range"
                    min={35}
                    max={100}
                    value={Math.round(cameraOverlay.opacity * 100)}
                    disabled={busy}
                    onChange={(e) =>
                      setCameraOverlay((prev) =>
                        normalizeCameraOverlay({
                          ...prev,
                          opacity: Number(e.target.value) / 100,
                        }),
                      )
                    }
                  />
                </label>
                {cameraOverlay.borderEnabled ? (
                  <>
                    <label className="camera-controls__field">
                      <span>Outline {cameraOverlay.borderWidthPx}px</span>
                      <input
                        type="range"
                        min={1}
                        max={6}
                        value={cameraOverlay.borderWidthPx}
                        disabled={busy}
                        onChange={(e) =>
                          setCameraOverlay((prev) =>
                            normalizeCameraOverlay({
                              ...prev,
                              borderWidthPx: Number(e.target.value),
                            }),
                          )
                        }
                      />
                    </label>
                    <div className="camera-controls__field camera-controls__field--color">
                      <span>Outline color</span>
                      <div className="camera-controls__swatches" role="listbox" aria-label="Outline color">
                        {CAMERA_BORDER_COLOR_PRESETS.map((preset) => {
                          const active =
                            cameraOverlay.borderColor.toUpperCase() ===
                            preset.color.toUpperCase()
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              role="option"
                              aria-selected={active}
                              aria-label={preset.label}
                              title={preset.label}
                              className={
                                active
                                  ? 'camera-controls__swatch camera-controls__swatch--active'
                                  : 'camera-controls__swatch'
                              }
                              style={{ background: preset.color }}
                              disabled={busy}
                              onClick={() =>
                                setCameraOverlay((prev) =>
                                  normalizeCameraOverlay({
                                    ...prev,
                                    borderColor: preset.color,
                                  }),
                                )
                              }
                            />
                          )
                        })}
                        <label className="camera-controls__swatch-custom" title="Custom color">
                          <span className="visually-hidden">Custom outline color</span>
                          <input
                            type="color"
                            value={cameraOverlay.borderColor}
                            disabled={busy}
                            onChange={(e) =>
                              setCameraOverlay((prev) =>
                                normalizeCameraOverlay({
                                  ...prev,
                                  borderColor: e.target.value,
                                }),
                              )
                            }
                          />
                        </label>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
            {cameraError ? (
              <p className="shell__status shell__status--warn" role="alert">
                {cameraError}
              </p>
            ) : null}
            {micNote && !cameraError ? (
              <p className="shell__status" role="status">
                {micNote}
              </p>
            ) : null}
            {/*
              Layout map lives in chrome (not capture preview) so mid-recording
              drag/scroll layout edits stay visible without burning FaceTime into
              screen WebM. Same relative coords as preview/export.
            */}
            {cameraOverlay.enabled || cameraLive ? (
              <CameraLayoutMap
                style={cameraOverlay}
                disabled={busy}
                onLayoutChange={(next) => setCameraOverlay(normalizeCameraOverlay(next))}
              />
            ) : null}
            {/*
              Docked self-view in app chrome while recording. Kept out of the
              capture preview so the layout-positioned bubble is not burned into
              screen WebM (export composites camera.webm once). Does not touch
              track.enabled — mid-recording mute stays authoritative.
              Click toggles mute via setCameraLiveDuringRecording.
            */}
            {isRecording && cameraStream ? (
              <CameraMonitor
                stream={cameraStream}
                live={cameraLive}
                mirrored={cameraOverlay.mirrored}
                shape={cameraOverlay.shape}
                onToggleLive={() => {
                  void setCameraLiveDuringRecording(!cameraLive)
                }}
              />
            ) : null}
          </div>
          {isRecording ? (
            <p className="shell__status" role="status">
              Live capture · {formatBytes(recording.bytesWritten)} · {recording.chunkCount}{' '}
              chunks · cursor trail
              {recording.cameraChunkCount > 0
                ? ` · camera ${formatBytes(recording.cameraBytesWritten)}${cameraLive ? '' : ' (muted)'}${
                    micLive && cameraLive ? ' + mic' : ''
                  }`
                : ''}
            </p>
          ) : null}
          {lastSummary && !isRecording ? (
            <p className="shell__status" role="status">
              {lastSummary}
            </p>
          ) : null}
        </section>

        <aside className="shell__preview" aria-label="Capture preview">
          <div className="preview-frame">
            <div className="preview-frame__glow" />
            <p className="preview-frame__label">
              {isRecording ? 'Live preview' : 'Pick a source'}
            </p>
            <video
              ref={previewRef}
              className={
                isRecording ? 'preview-frame__video' : 'preview-frame__video preview-frame__video--hidden'
              }
              muted
              playsInline
              autoPlay
            />
            {/*
              Hide the live FaceTime bubble while recording so full-display capture
              does not burn it into screen WebM (review overlays camera.webm once).
            */}
            {isRecording && cameraLive ? (
              <div className="camera-recording-badge" role="status">
                Camera recording
              </div>
            ) : isRecording && recording.cameraChunkCount > 0 ? (
              <div className="camera-recording-badge camera-recording-badge--muted" role="status">
                Camera muted
              </div>
            ) : (
              <CameraBubble
                stream={cameraStream}
                style={cameraOverlay}
                onLayoutChange={(next) => setCameraOverlay(normalizeCameraOverlay(next))}
              />
            )}
            {!isRecording ? (
              sources.length === 0 ? (
                <EmptyHint
                  copy={sourcesEmptyTooltip(inElectron)}
                  className="preview-frame__hint"
                  action={
                    inElectron
                      ? {
                          label: 'Refresh sources',
                          onClick: () => void refreshSources(),
                          disabled: busy,
                          title: TOOLTIPS['refresh-sources'].title,
                        }
                      : undefined
                  }
                />
              ) : (
                <ul className="source-list">
                  {sources.map((source) => {
                    const active = source.id === selectedSourceId
                    return (
                      <li key={source.id}>
                        <button
                          type="button"
                          className={
                            active ? 'source-item source-item--active' : 'source-item'
                          }
                          disabled={busy}
                          onClick={() => setSelectedSourceId(source.id)}
                        >
                          {source.thumbnailDataUrl ? (
                            <img
                              className="source-item__thumb"
                              src={source.thumbnailDataUrl}
                              alt=""
                            />
                          ) : (
                            <span className="source-item__thumb source-item__thumb--empty" />
                          )}
                          <span className="source-item__meta">
                            <span className="source-item__name">{source.name}</span>
                            <span className="source-item__kind">{source.kind}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )
            ) : (
              <p className="preview-frame__hint">
                Streaming “{selected?.name ?? 'source'}” to temp WebM
                {recording.outputPath ? ` (${recording.outputPath})` : ''}.
              </p>
            )}
          </div>
        </aside>
      </main>
    </div>
  )
}
