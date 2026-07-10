import { useState } from 'react'
import type { ExportProgressEvent } from '../../shared/ipc'
import type { CursorEvent } from '../../shared/cursor'
import { defaultReviewEdit, formatTimeMs, type ReviewEditState } from '../../shared/edit'
import { BACKGROUND_PRESETS } from '../../shared/background'
import { AutoZoomPlayback } from './AutoZoomPlayback'

export interface RecordingReviewProps {
  mediaUrl: string
  webmPath: string
  cursorEvents: CursorEvent[]
  cursorEventsPath: string | null
  durationMs: number
  bytesWritten: number
  chunkCount: number
  cursorEventCount: number
  exporting: boolean
  exportProgress: ExportProgressEvent | null
  onExport: (edit: ReviewEditState) => void
  onCancelExport: () => void
  onDiscard: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function RecordingReview({
  mediaUrl,
  cursorEvents,
  durationMs: recordedDurationMs,
  bytesWritten,
  chunkCount,
  cursorEventCount,
  exporting,
  exportProgress,
  onExport,
  onCancelExport,
  onDiscard,
}: RecordingReviewProps) {
  const [durationMs, setDurationMs] = useState(recordedDurationMs)
  const [edit, setEdit] = useState<ReviewEditState>(() =>
    defaultReviewEdit(recordedDurationMs),
  )

  function onDurationMs(ms: number) {
    if (ms > 0) {
      setDurationMs(ms)
      setEdit((prev) => ({
        ...prev,
        trimEndMs: prev.trimEndMs > ms || prev.trimEndMs === 0 ? ms : prev.trimEndMs,
      }))
    }
  }

  const trimDurationMs = Math.max(0, edit.trimEndMs - edit.trimStartMs)

  return (
    <div className="review">
      <header className="review__header">
        <div>
          <h2 className="review__title">Review your recording</h2>
          <p className="review__subtitle">
            {formatBytes(bytesWritten)} · {chunkCount} chunks · {cursorEventCount} cursor events ·{' '}
            {(recordedDurationMs / 1000).toFixed(1)}s captured
          </p>
        </div>
        <div className="review__header-actions">
          <button type="button" className="btn btn--ghost" disabled={exporting} onClick={onDiscard}>
            New recording
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={exporting}
            onClick={() => onExport(edit)}
          >
            {exporting ? 'Exporting…' : 'Export MP4'}
          </button>
          {exporting ? (
            <button type="button" className="btn btn--danger" onClick={onCancelExport}>
              Cancel
            </button>
          ) : null}
        </div>
      </header>

      {exporting && exportProgress ? (
        <p className="review__export-status" role="status">
          Export {exportProgress.phase}
          {exportProgress.percent > 0 ? ` · ${exportProgress.percent}%` : ''}
          {exportProgress.message ? ` — ${exportProgress.message}` : ''}
        </p>
      ) : null}

      <div className="review__layout">
        <section className="review__preview" aria-label="Recording preview">
          <AutoZoomPlayback
            mediaUrl={mediaUrl}
            cursorEvents={cursorEvents}
            autoZoomEnabled={edit.autoZoomEnabled}
            cursorSmoothingEnabled={edit.cursorSmoothingEnabled}
            background={edit.background}
            trimStartMs={edit.trimStartMs}
            trimEndMs={edit.trimEndMs}
            onDurationMs={onDurationMs}
          />
        </section>

        <aside className="review__editor" aria-label="Edit recording">
          <h3 className="review__panel-title">Edit</h3>

          <label className="review__toggle">
            <input
              type="checkbox"
              checked={edit.autoZoomEnabled}
              disabled={exporting}
              onChange={(e) =>
                setEdit((prev) => ({ ...prev, autoZoomEnabled: e.target.checked }))
              }
            />
            <span>Auto-zoom on clicks</span>
          </label>

          <label className="review__toggle">
            <input
              type="checkbox"
              checked={edit.cursorSmoothingEnabled}
              disabled={exporting}
              onChange={(e) =>
                setEdit((prev) => ({ ...prev, cursorSmoothingEnabled: e.target.checked }))
              }
            />
            <span>Cursor smoothing + click rings</span>
          </label>

          <label className="review__toggle">
            <input
              type="checkbox"
              checked={edit.background.enabled}
              disabled={exporting}
              onChange={(e) =>
                setEdit((prev) => ({
                  ...prev,
                  background: { ...prev.background, enabled: e.target.checked },
                }))
              }
            />
            <span>Aesthetic background + padding</span>
          </label>

          {edit.background.enabled ? (
            <>
              <div className="review__field">
                <span className="review__label">Background style</span>
                <div className="review__presets" role="group" aria-label="Background preset">
                  {BACKGROUND_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`review__preset${
                        edit.background.presetId === preset.id ? ' review__preset--active' : ''
                      }`}
                      disabled={exporting}
                      title={preset.label}
                      aria-label={preset.label}
                      aria-pressed={edit.background.presetId === preset.id}
                      onClick={() =>
                        setEdit((prev) => ({
                          ...prev,
                          background: { ...prev.background, presetId: preset.id },
                        }))
                      }
                    >
                      <span
                        className="review__preset-swatch"
                        style={{ background: preset.css }}
                      />
                      <span className="review__preset-label">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="review__field">
                <label className="review__label" htmlFor="bg-padding">
                  Padding — {edit.background.paddingPercent}%
                </label>
                <input
                  id="bg-padding"
                  type="range"
                  className="review__range"
                  min={4}
                  max={24}
                  step={1}
                  value={edit.background.paddingPercent}
                  disabled={exporting}
                  onChange={(e) =>
                    setEdit((prev) => ({
                      ...prev,
                      background: {
                        ...prev.background,
                        paddingPercent: Number(e.target.value),
                      },
                    }))
                  }
                />
              </div>

              <label className="review__toggle review__toggle--nested">
                <input
                  type="checkbox"
                  checked={edit.background.shadowEnabled}
                  disabled={exporting}
                  onChange={(e) =>
                    setEdit((prev) => ({
                      ...prev,
                      background: { ...prev.background, shadowEnabled: e.target.checked },
                    }))
                  }
                />
                <span>Drop shadow</span>
              </label>
            </>
          ) : null}

          <div className="review__field">
            <label className="review__label" htmlFor="trim-start">
              Trim start — {formatTimeMs(edit.trimStartMs)}
            </label>
            <input
              id="trim-start"
              type="range"
              className="review__range"
              min={0}
              max={Math.max(0, edit.trimEndMs - 100)}
              step={100}
              value={edit.trimStartMs}
              disabled={exporting || durationMs <= 0}
              onChange={(e) => {
                const next = Number(e.target.value)
                setEdit((prev) => ({
                  ...prev,
                  trimStartMs: Math.min(next, prev.trimEndMs - 100),
                }))
              }}
            />
          </div>

          <div className="review__field">
            <label className="review__label" htmlFor="trim-end">
              Trim end — {formatTimeMs(edit.trimEndMs)}
            </label>
            <input
              id="trim-end"
              type="range"
              className="review__range"
              min={Math.min(durationMs, edit.trimStartMs + 100)}
              max={durationMs}
              step={100}
              value={edit.trimEndMs}
              disabled={exporting || durationMs <= 0}
              onChange={(e) => {
                const next = Number(e.target.value)
                setEdit((prev) => ({
                  ...prev,
                  trimEndMs: Math.max(next, prev.trimStartMs + 100),
                }))
              }}
            />
          </div>

          <p className="review__hint">
            Export length: {formatTimeMs(trimDurationMs)}
            {edit.trimStartMs > 0 || edit.trimEndMs < durationMs
              ? ' (trim baked into MP4 export)'
              : ''}
          </p>

          <div className="review__coming">
            <p className="review__coming-title">Coming next</p>
            <ul>
              <li>Per-click zoom points</li>
              <li>Export GIF / WebM</li>
              <li>One-click beautify preset</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
