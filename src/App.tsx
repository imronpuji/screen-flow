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
  CAMERA_CORNERS,
  DEFAULT_CAMERA_OVERLAY,
  normalizeCameraOverlay,
  type CameraOverlayStyle,
} from '../shared/camera'
import {
  startCameraCapture,
  startLiveCapture,
  type LiveCaptureHandle,
} from './lib/captureStream'
import {
  listCameraDevices,
  openCameraStream,
  stopMediaStream,
  type CameraDevice,
} from './lib/cameraDevices'
import {
  appendRecordingChunk,
  cancelExport,
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
  saveExport,
  startRecording,
  stopRecording,
} from './lib/runtime'
import { CameraBubble } from './components/CameraBubble'
import { RecordingReview } from './components/RecordingReview'
import type { CursorEvent } from '../shared/cursor'
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
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [playbackCursorEvents, setPlaybackCursorEvents] = useState<CursorEvent[]>([])
  const [reviewDurationMs, setReviewDurationMs] = useState(0)
  const [reviewBytesWritten, setReviewBytesWritten] = useState(0)
  const [reviewChunkCount, setReviewChunkCount] = useState(0)
  const [reviewCursorEventCount, setReviewCursorEventCount] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<ExportProgressEvent | null>(null)
  const [cameraOverlay, setCameraOverlay] = useState<CameraOverlayStyle>(DEFAULT_CAMERA_OVERLAY)
  const [cameraDevices, setCameraDevices] = useState<CameraDevice[]>([])
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const previewRef = useRef<HTMLVideoElement | null>(null)
  const captureRef = useRef<LiveCaptureHandle | null>(null)
  const cameraCaptureRef = useRef<LiveCaptureHandle | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)

  const inElectron = isElectronBridgeAvailable()
  const isRecording = mode === 'recording' || recording.state === 'recording'
  const canRecord =
    inElectron && !busy && mode !== 'review' && Boolean(selectedSourceId) && permission?.screen !== 'denied'

  useEffect(() => {
    return onExportProgress((event) => {
      setExportProgress(event)
    })
  }, [])

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
      stopMediaStream(cameraStreamRef.current)
      cameraStreamRef.current = null
    }
  }, [])

  async function refreshCameraDevices() {
    try {
      const devices = await listCameraDevices()
      setCameraDevices(devices)
      setCameraOverlay((prev) => {
        if (prev.deviceId && devices.some((d) => d.deviceId === prev.deviceId)) return prev
        return normalizeCameraOverlay({
          ...prev,
          deviceId: devices[0]?.deviceId ?? null,
        })
      })
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Failed to list cameras')
    }
  }

  async function enableCameraPreview(next: CameraOverlayStyle) {
    setCameraError(null)
    try {
      const stream = await openCameraStream(next.deviceId)
      stopMediaStream(cameraStreamRef.current)
      cameraStreamRef.current = stream
      setCameraStream(stream)
      await refreshCameraDevices()
      setCameraOverlay(normalizeCameraOverlay({ ...next, enabled: true }))
    } catch (err) {
      stopMediaStream(cameraStreamRef.current)
      cameraStreamRef.current = null
      setCameraStream(null)
      setCameraOverlay(normalizeCameraOverlay({ ...next, enabled: false }))
      setCameraError(err instanceof Error ? err.message : 'Camera unavailable')
    }
  }

  function disableCameraPreview() {
    void cameraCaptureRef.current?.stop()
    cameraCaptureRef.current = null
    stopMediaStream(cameraStreamRef.current)
    cameraStreamRef.current = null
    setCameraStream(null)
    setCameraOverlay((prev) => normalizeCameraOverlay({ ...prev, enabled: false }))
    setCameraError(null)
  }

  function clearReview() {
    setMode('setup')
    setLastWebmPath(null)
    setLastCursorEventsPath(null)
    setLastCameraPath(null)
    setPlaybackUrl(null)
    setPlaybackCursorEvents([])
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
        await handle?.stop()
        await cameraHandle?.stop()
        bindPreview(null)
        const result = await stopRecording()
        setRecording(result.status)
        setLastWebmPath(result.outputPath)
        setLastCursorEventsPath(result.cursorEventsPath)
        setLastCameraPath(result.cameraOutputPath)
        setReviewDurationMs(result.durationMs)
        setReviewBytesWritten(result.bytesWritten)
        setReviewChunkCount(result.chunkCount)
        setReviewCursorEventCount(result.cursorEventCount)

        if (!result.outputPath) {
          setMode('setup')
          setLastSummary(`Session ${(result.durationMs / 1000).toFixed(1)}s with no video data.`)
          return
        }

        try {
          const [media, cursor] = await Promise.all([
            getMediaUrl({ filePath: result.outputPath }),
            result.cursorEventsPath
              ? readCursorEvents({ eventsPath: result.cursorEventsPath })
              : Promise.resolve({ ok: true as const, events: [] as CursorEvent[] }),
          ])
          setPlaybackUrl(media.url)
          setPlaybackCursorEvents(cursor.events)
          setMode('review')
          setLastSummary(
            [
              `Ready to review · ${(result.durationMs / 1000).toFixed(1)}s`,
              result.cameraChunkCount > 0
                ? `camera track ${formatBytes(result.cameraBytesWritten)}`
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
        } catch (captureErr) {
          void cameraCaptureRef.current?.stop()
          cameraCaptureRef.current = null
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

  async function onExportMp4(_edit: ReviewEditState) {
    if (!lastWebmPath) return
    setExporting(true)
    setExportProgress({ phase: 'starting', percent: 0 })
    setError(null)
    try {
      const exportRequest: Parameters<typeof exportWebmToMp4>[0] = {
        inputPath: lastWebmPath,
        cleanupTemp: true,
        trim: {
          startMs: _edit.trimStartMs,
          endMs: _edit.trimEndMs,
        },
      }
      if (_edit.autoZoomEnabled && lastCursorEventsPath) {
        exportRequest.autoZoom = { cursorEventsPath: lastCursorEventsPath }
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
      if (lastCameraPath && cameraOverlay.enabled) {
        exportRequest.camera = {
          cameraPath: lastCameraPath,
          style: cameraOverlay,
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

      const saved = await saveExport({
        sourcePath: result.outputPath,
        cleanupSource: true,
      })
      if (saved.cancelled) {
        setLastSummary(
          `Exported MP4 (${result.codec}${bakedLabel}) · ${formatBytes(result.bytesWritten)} (not saved to Documents)`,
        )
      } else {
        setLastSummary(
          `Saved MP4 (${result.codec}${bakedLabel}) · ${formatBytes(saved.bytesWritten)} → ${saved.outputPath}`,
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
            <button
              type="button"
              className={isRecording ? 'btn btn--danger' : 'btn btn--primary'}
              disabled={!canRecord && !isRecording}
              onClick={() => void onToggleRecording()}
            >
              {isRecording ? 'Stop recording' : 'Start recording'}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={!inElectron || busy || isRecording}
              onClick={() => void refreshSources()}
            >
              Refresh sources
            </button>
          </div>
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
            <label className="camera-controls__toggle">
              <input
                type="checkbox"
                checked={cameraOverlay.enabled}
                disabled={busy || isRecording}
                onChange={(e) => {
                  const checked = e.target.checked
                  if (checked) {
                    void enableCameraPreview(cameraOverlay)
                  } else {
                    disableCameraPreview()
                  }
                }}
              />
              <span>FaceTime camera overlay</span>
            </label>
            {cameraOverlay.enabled ? (
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
                <label className="camera-controls__field">
                  <span>Corner</span>
                  <select
                    value={cameraOverlay.corner}
                    disabled={busy}
                    onChange={(e) =>
                      setCameraOverlay((prev) =>
                        normalizeCameraOverlay({
                          ...prev,
                          corner: e.target.value as CameraOverlayStyle['corner'],
                        }),
                      )
                    }
                  >
                    {CAMERA_CORNERS.map((c) => (
                      <option key={c} value={c}>
                        {c.replace('-', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="camera-controls__field">
                  <span>Size {cameraOverlay.sizePercent}%</span>
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
                        }),
                      )
                    }
                  />
                </label>
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
                  </select>
                </label>
              </div>
            ) : null}
            {cameraError ? (
              <p className="shell__status shell__status--warn" role="alert">
                {cameraError}
              </p>
            ) : null}
          </div>
          {isRecording ? (
            <p className="shell__status" role="status">
              Live capture · {formatBytes(recording.bytesWritten)} · {recording.chunkCount}{' '}
              chunks · cursor trail
              {recording.cameraOutputPath
                ? ` · camera ${formatBytes(recording.cameraBytesWritten)}`
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
            <CameraBubble stream={cameraStream} style={cameraOverlay} />
            {!isRecording ? (
              !inElectron ? (
                <p className="preview-frame__hint">
                  Open via Electron to list displays with desktopCapturer.
                </p>
              ) : sources.length === 0 ? (
                <p className="preview-frame__hint">
                  No sources yet. On macOS, grant Screen Recording and refresh.
                </p>
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
