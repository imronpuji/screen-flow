import { useEffect, useState } from 'react'
import type {
  AppInfo,
  CaptureSource,
  PermissionStatus,
  RecordingStatus,
} from '../shared/ipc'
import {
  fetchAppInfo,
  fetchCaptureSources,
  fetchPermissionStatus,
  fetchRecordingStatus,
  isElectronBridgeAvailable,
  startRecording,
  stopRecording,
} from './lib/runtime'
import './App.css'

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [permission, setPermission] = useState<PermissionStatus | null>(null)
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [recording, setRecording] = useState<RecordingStatus>({
    state: 'idle',
    sourceId: null,
    startedAt: null,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null)

  const inElectron = isElectronBridgeAvailable()
  const isRecording = recording.state === 'recording'
  const canRecord =
    inElectron && !busy && Boolean(selectedSourceId) && permission?.screen !== 'denied'

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

  async function onToggleRecording() {
    if (!selectedSourceId && !isRecording) return
    setBusy(true)
    setError(null)
    try {
      if (isRecording) {
        const result = await stopRecording()
        setRecording(result.status)
        setLastDurationMs(result.durationMs)
      } else {
        const result = await startRecording({ sourceId: selectedSourceId! })
        setRecording(result.status)
        setLastDurationMs(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recording action failed')
    } finally {
      setBusy(false)
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
          {lastDurationMs != null && !isRecording ? (
            <p className="shell__status" role="status">
              Stub session lasted {(lastDurationMs / 1000).toFixed(1)}s — encode pipeline next.
            </p>
          ) : null}
        </section>

        <aside className="shell__preview" aria-label="Capture sources">
          <div className="preview-frame">
            <div className="preview-frame__glow" />
            <p className="preview-frame__label">
              {isRecording ? 'Recording (stub)' : 'Sources'}
            </p>
            {!inElectron ? (
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
                        disabled={isRecording || busy}
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
            )}
            {selected && isRecording ? (
              <p className="preview-frame__hint">
                Capturing stub session for “{selected.name}”. Frames/ffmpeg come next.
              </p>
            ) : null}
          </div>
        </aside>
      </main>
    </div>
  )
}
