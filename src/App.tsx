import { useEffect, useRef, useState } from 'react'
import type {
  AppInfo,
  CaptureSource,
  ExportProgressEvent,
  PermissionStatus,
  RecordingStatus,
} from '../shared/ipc'
import { startLiveCapture, type LiveCaptureHandle } from './lib/captureStream'
import {
  appendRecordingChunk,
  cancelExport,
  exportWebmToMp4,
  fetchAppInfo,
  fetchCaptureSources,
  fetchPermissionStatus,
  fetchRecordingStatus,
  isElectronBridgeAvailable,
  isExportCancelledError,
  onExportProgress,
  saveExport,
  startRecording,
  stopRecording,
} from './lib/runtime'
import './App.css'

const idleRecording: RecordingStatus = {
  state: 'idle',
  sourceId: null,
  startedAt: null,
  sessionDir: null,
  outputPath: null,
  bytesWritten: 0,
  chunkCount: 0,
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSummary, setLastSummary] = useState<string | null>(null)
  const [lastWebmPath, setLastWebmPath] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<ExportProgressEvent | null>(null)
  const previewRef = useRef<HTMLVideoElement | null>(null)
  const captureRef = useRef<LiveCaptureHandle | null>(null)

  const inElectron = isElectronBridgeAvailable()
  const isRecording = recording.state === 'recording'
  const canRecord =
    inElectron && !busy && Boolean(selectedSourceId) && permission?.screen !== 'denied'
  const canExport =
    inElectron && !busy && !isRecording && !exporting && Boolean(lastWebmPath)

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
    }
  }, [])

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
        await handle?.stop()
        bindPreview(null)
        const result = await stopRecording()
        setRecording(result.status)
        setLastWebmPath(result.outputPath)
        const size = formatBytes(result.bytesWritten)
        const secs = (result.durationMs / 1000).toFixed(1)
        setLastSummary(
          result.outputPath
            ? `Saved ${size} (${result.chunkCount} chunks, ${result.cursorEventCount} cursor events) in ${secs}s → ${result.outputPath}`
            : `Session ${secs}s with no chunks written.`,
        )
      } else {
        setLastSummary(null)
        setLastWebmPath(null)
        const started = await startRecording({ sourceId: selectedSourceId! })
        setRecording(started.status)

        try {
          const handle = await startLiveCapture({
            sourceId: selectedSourceId!,
            onChunk: async (data) => {
              const result = await appendRecordingChunk({ data })
              setRecording((prev) =>
                prev.state === 'recording'
                  ? {
                      ...prev,
                      bytesWritten: result.bytesWritten,
                      chunkCount: result.chunkCount,
                    }
                  : prev,
              )
            },
            onError: (err) => setError(err.message),
          })
          captureRef.current = handle
          bindPreview(handle.stream)
        } catch (captureErr) {
          // Roll back main session if getUserMedia / MediaRecorder fails.
          try {
            await stopRecording()
          } catch {
            /* ignore */
          }
          setRecording(idleRecording)
          throw captureErr
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recording action failed')
    } finally {
      setBusy(false)
    }
  }

  async function onExportMp4() {
    if (!lastWebmPath) return
    setExporting(true)
    setExportProgress({ phase: 'starting', percent: 0 })
    setError(null)
    try {
      const result = await exportWebmToMp4({
        inputPath: lastWebmPath,
        cleanupTemp: true,
      })
      setLastWebmPath(null)
      setExportProgress({ phase: 'done', percent: 100, message: 'Saving…' })

      // Offer Save As → Documents/Screen Flow (user can cancel and keep temp path).
      const saved = await saveExport({
        sourcePath: result.outputPath,
        cleanupSource: true,
      })
      if (saved.cancelled) {
        setLastSummary(
          `Exported MP4 (${result.codec}) · ${formatBytes(result.bytesWritten)} → ${result.outputPath} (not saved to Documents)`,
        )
      } else {
        setLastSummary(
          `Saved MP4 (${result.codec}) · ${formatBytes(saved.bytesWritten)} → ${saved.outputPath}`,
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
              disabled={!canExport}
              onClick={() => void onExportMp4()}
            >
              {exporting ? 'Exporting…' : 'Export MP4'}
            </button>
            {exporting ? (
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => void onCancelExport()}
              >
                Cancel export
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--ghost"
              disabled={!inElectron || busy || isRecording || exporting}
              onClick={() => void refreshSources()}
            >
              Refresh sources
            </button>
          </div>
          {exporting && exportProgress ? (
            <p className="shell__status" role="status">
              Export {exportProgress.phase}
              {exportProgress.percent > 0 ? ` · ${exportProgress.percent}%` : ''}
              {exportProgress.message ? ` — ${exportProgress.message}` : ''}
            </p>
          ) : null}
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
          {isRecording ? (
            <p className="shell__status" role="status">
              Live capture · {formatBytes(recording.bytesWritten)} · {recording.chunkCount}{' '}
              chunks · cursor trail recording
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
              {isRecording ? 'Live preview' : 'Sources'}
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
                          disabled={busy || exporting}
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
