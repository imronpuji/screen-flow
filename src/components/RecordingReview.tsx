import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExportProgressEvent } from '../../shared/ipc'
import type { CursorEvent } from '../../shared/cursor'
import {
  CURSOR_STYLE_OPTIONS,
  clampCursorSizeScale,
  type CursorStyleId,
} from '../../shared/cursorAppearance'
import { defaultReviewEdit, formatTimeMs, type ReviewEditState } from '../../shared/edit'
import {
  BEAUTIFY_PRESETS,
  applyBeautifyPreset,
  type BeautifyPresetId,
} from '../../shared/beautify'
import { BACKGROUND_PRESETS } from '../../shared/background'
import {
  EXPORT_QUALITY_PRESETS,
  getExportQualityPreset,
} from '../../shared/exportQuality'
import {
  CAMERA_BORDER_COLOR_PRESETS,
  CAMERA_SNAP_PRESETS,
  DEFAULT_CAMERA_OVERLAY,
  applyCameraSnapPreset,
  cameraSnapPresetLabel,
  matchCameraSnapTarget,
  normalizeCameraOverlay,
  type CameraOverlayStyle,
  type CameraShape,
} from '../../shared/camera'
import type { CameraSyncMeta } from '../../shared/cameraSync'
import {
  isEditableTarget,
  matchShortcut,
  shortcutsForContext,
} from '../../shared/shortcuts'
import { buildZoomSegments } from '../../shared/autozoom'
import {
  clampZoomPeakScale,
  countEnabledZoomPoints,
  isZoomPointEnabled,
  resolveZoomPointPeakScale,
  upsertZoomPointOverride,
} from '../../shared/zoomPoints'
import { AutoZoomPlayback } from './AutoZoomPlayback'
import { EmptyHint, Tooltip } from './Tooltip'
import type { CaptureGeometry } from '../../shared/cursorCoords'
import { TOOLTIPS } from '../../shared/tooltips'

export interface RecordingReviewProps {
  mediaUrl: string
  webmPath: string
  cursorEvents: CursorEvent[]
  cursorEventsPath: string | null
  /** Display DIP geometry for precise auto-zoom / cursor overlay. */
  captureGeometry?: CaptureGeometry | null
  /** Recorded camera.webm playback URL (null if no camera track). */
  cameraMediaUrl?: string | null
  /** First-chunk wall sync for review bubble seek (matches export drift). */
  cameraSync?: CameraSyncMeta | null
  /** Layout captured at record time; editable in review before export. */
  initialCameraOverlay?: CameraOverlayStyle
  /** Sync layout edits back to setup so the next recording keeps the polish. */
  onCameraOverlayChange?: (style: CameraOverlayStyle) => void
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
  captureGeometry = null,
  cameraMediaUrl = null,
  cameraSync = null,
  initialCameraOverlay = DEFAULT_CAMERA_OVERLAY,
  onCameraOverlayChange,
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
    defaultReviewEdit(recordedDurationMs, {
      ...initialCameraOverlay,
      // Only enable in review when a camera track exists.
      enabled: Boolean(cameraMediaUrl) && initialCameraOverlay.enabled,
    }),
  )

  const hasCameraTrack = Boolean(cameraMediaUrl)
  const editRef = useRef(edit)
  const onCameraOverlayChangeRef = useRef(onCameraOverlayChange)

  const zoomSegments = useMemo(
    () =>
      edit.autoZoomEnabled
        ? buildZoomSegments(
            cursorEvents,
            { width: 1920, height: 1080 },
            captureGeometry ? { geometry: captureGeometry } : {},
          )
        : [],
    [captureGeometry, cursorEvents, edit.autoZoomEnabled],
  )

  const enabledZoomCount = countEnabledZoomPoints(
    zoomSegments.length,
    edit.zoomPointOverrides,
  )

  useEffect(() => {
    editRef.current = edit
  }, [edit])

  useEffect(() => {
    onCameraOverlayChangeRef.current = onCameraOverlayChange
  }, [onCameraOverlayChange])

  // Keep setup FaceTime prefs in sync with review layout (preview ≡ next record).
  // If this clip has no camera track, preserve the setup "enabled" flag from record time.
  useEffect(() => {
    const forSetup = hasCameraTrack
      ? edit.cameraOverlay
      : { ...edit.cameraOverlay, enabled: initialCameraOverlay.enabled }
    onCameraOverlayChangeRef.current?.(normalizeCameraOverlay(forSetup))
  }, [edit.cameraOverlay, hasCameraTrack, initialCameraOverlay.enabled])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableTarget(event.target)) return
      const context = exporting ? 'exporting' : 'review'
      const action = matchShortcut(event, context)
      if (!action) return

      if (action === 'cancel-export') {
        event.preventDefault()
        onCancelExport()
        return
      }
      if (exporting) return

      if (action === 'export') {
        event.preventDefault()
        onExport(editRef.current)
        return
      }
      if (action === 'beautify') {
        event.preventDefault()
        setEdit((prev) =>
          applyBeautifyPreset(prev, 'tutorial', { hasCameraTrack }),
        )
        return
      }
      if (action === 'discard') {
        event.preventDefault()
        onDiscard()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [exporting, hasCameraTrack, onCancelExport, onDiscard, onExport])

  function patchCamera(partial: Partial<CameraOverlayStyle>) {
    setEdit((prev) => ({
      ...prev,
      cameraOverlay: normalizeCameraOverlay({ ...prev.cameraOverlay, ...partial }),
    }))
  }

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
            {hasCameraTrack ? ' · camera track' : ''}
          </p>
        </div>
        <div className="review__header-actions">
          <Tooltip copy={TOOLTIPS['discard-review']}>
            <button type="button" className="btn btn--ghost" disabled={exporting} onClick={onDiscard}>
              New recording
            </button>
          </Tooltip>
          <Tooltip copy={TOOLTIPS.beautify}>
            <button
              type="button"
              className="btn btn--accent"
              disabled={exporting}
              onClick={() =>
                setEdit((prev) =>
                  applyBeautifyPreset(prev, 'tutorial', { hasCameraTrack }),
                )
              }
            >
              Beautify
            </button>
          </Tooltip>
          <Tooltip copy={TOOLTIPS['export-ready']}>
            <button
              type="button"
              className="btn btn--primary"
              disabled={exporting}
              onClick={() => onExport(edit)}
            >
              {exporting ? 'Exporting…' : 'Export MP4'}
            </button>
          </Tooltip>
          {exporting ? (
            <button type="button" className="btn btn--danger" onClick={onCancelExport} title="Esc">
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
            captureGeometry={captureGeometry}
            autoZoomEnabled={edit.autoZoomEnabled}
            zoomPointOverrides={edit.zoomPointOverrides}
            cursorSmoothingEnabled={edit.cursorSmoothingEnabled}
            cursorAppearance={edit.cursorAppearance}
            background={edit.background}
            cameraMediaUrl={cameraMediaUrl}
            cameraSync={cameraSync}
            cameraOverlay={edit.cameraOverlay}
            onCameraLayoutChange={(next) =>
              setEdit((prev) => ({
                ...prev,
                cameraOverlay: normalizeCameraOverlay(next),
              }))
            }
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

          {edit.autoZoomEnabled ? (
            <div className="review__zoom-points" aria-label="Zoom points">
              <div className="review__field">
                <span className="review__label">
                  Zoom points · {enabledZoomCount}/{zoomSegments.length} on
                </span>
                {zoomSegments.length === 0 ? (
                  <p className="review__hint">
                    No click zooms yet — record with clicks to generate points.
                  </p>
                ) : (
                  <ul className="review__zoom-list">
                    {zoomSegments.map((seg, index) => {
                      const enabled = isZoomPointEnabled(index, edit.zoomPointOverrides)
                      const peak = resolveZoomPointPeakScale(
                        seg,
                        index,
                        edit.zoomPointOverrides,
                      )
                      return (
                        <li
                          key={`zoom-point-${index}-${seg.startMs}`}
                          className={`review__zoom-item${
                            enabled ? '' : ' review__zoom-item--off'
                          }`}
                        >
                          <label className="review__toggle review__toggle--nested">
                            <input
                              type="checkbox"
                              checked={enabled}
                              disabled={exporting}
                              onChange={(e) =>
                                setEdit((prev) => ({
                                  ...prev,
                                  zoomPointOverrides: upsertZoomPointOverride(
                                    prev.zoomPointOverrides,
                                    {
                                      index,
                                      enabled: e.target.checked,
                                      peakScale: peak,
                                    },
                                  ),
                                }))
                              }
                            />
                            <span>
                              Zoom {index + 1} · {formatTimeMs(seg.peakMs)}
                            </span>
                          </label>
                          {enabled ? (
                            <div className="review__field review__field--compact">
                              <label
                                className="review__label"
                                htmlFor={`zoom-scale-${index}`}
                              >
                                Scale {peak.toFixed(1)}×
                              </label>
                              <input
                                id={`zoom-scale-${index}`}
                                className="review__range"
                                type="range"
                                min={1.1}
                                max={3}
                                step={0.1}
                                value={peak}
                                disabled={exporting}
                                onChange={(e) =>
                                  setEdit((prev) => ({
                                    ...prev,
                                    zoomPointOverrides: upsertZoomPointOverride(
                                      prev.zoomPointOverrides,
                                      {
                                        index,
                                        enabled: true,
                                        peakScale: clampZoomPeakScale(
                                          Number(e.target.value),
                                        ),
                                      },
                                    ),
                                  }))
                                }
                              />
                            </div>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
                {zoomSegments.length > 0 ? (
                  <p className="review__hint">
                    Toggle points or tweak scale — preview and export stay in sync.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <label className="review__toggle">
            <input
              type="checkbox"
              checked={edit.cursorSmoothingEnabled}
              disabled={exporting}
              onChange={(e) =>
                setEdit((prev) => ({ ...prev, cursorSmoothingEnabled: e.target.checked }))
              }
            />
            <span>Cursor smoothing + click ring</span>
          </label>

          {edit.cursorSmoothingEnabled ? (
            <>
              <div className="review__field">
                <span className="review__label">Cursor style</span>
                <div className="review__presets" role="group" aria-label="Cursor style">
                  {CURSOR_STYLE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`review__preset${
                        edit.cursorAppearance.style === option.id
                          ? ' review__preset--active'
                          : ''
                      }`}
                      disabled={exporting}
                      onClick={() =>
                        setEdit((prev) => ({
                          ...prev,
                          cursorAppearance: {
                            ...prev.cursorAppearance,
                            style: option.id as CursorStyleId,
                          },
                        }))
                      }
                    >
                      <span className="review__preset-label">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {edit.cursorAppearance.style !== 'hidden' ? (
                <>
                  <div className="review__field">
                    <label className="review__label" htmlFor="cursor-size">
                      Size {edit.cursorAppearance.sizeScale.toFixed(1)}×
                    </label>
                    <input
                      id="cursor-size"
                      className="review__range"
                      type="range"
                      min={0.5}
                      max={3}
                      step={0.1}
                      value={edit.cursorAppearance.sizeScale}
                      disabled={exporting}
                      onChange={(e) =>
                        setEdit((prev) => ({
                          ...prev,
                          cursorAppearance: {
                            ...prev.cursorAppearance,
                            sizeScale: clampCursorSizeScale(Number(e.target.value)),
                          },
                        }))
                      }
                    />
                  </div>
                  <label className="review__toggle review__toggle--nested">
                    <input
                      type="checkbox"
                      checked={edit.cursorAppearance.spotlightEnabled}
                      disabled={exporting}
                      onChange={(e) =>
                        setEdit((prev) => ({
                          ...prev,
                          cursorAppearance: {
                            ...prev.cursorAppearance,
                            spotlightEnabled: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>Spotlight around cursor</span>
                  </label>
                </>
              ) : null}
            </>
          ) : null}

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
            <span>Aesthetic background</span>
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
                        aria-hidden="true"
                      />
                      <span className="review__preset-label">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="review__field">
                <label className="review__label" htmlFor="bg-padding">
                  Padding {edit.background.paddingPercent}%
                </label>
                <input
                  id="bg-padding"
                  className="review__range"
                  type="range"
                  min={4}
                  max={18}
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
                      background: {
                        ...prev.background,
                        shadowEnabled: e.target.checked,
                      },
                    }))
                  }
                />
                <span>Soft shadow</span>
              </label>
            </>
          ) : null}

          {hasCameraTrack ? (
            <>
              <label className="review__toggle">
                <input
                  type="checkbox"
                  checked={edit.cameraOverlay.enabled}
                  disabled={exporting}
                  onChange={(e) => patchCamera({ enabled: e.target.checked })}
                />
                <span>FaceTime camera overlay</span>
              </label>

              {edit.cameraOverlay.enabled ? (
                <>
                  <div className="review__field">
                    <span className="review__label">Position</span>
                    <div className="review__presets" role="group" aria-label="Camera position presets">
                      {CAMERA_SNAP_PRESETS.map((target) => {
                        const active = matchCameraSnapTarget(edit.cameraOverlay) === target
                        return (
                          <button
                            key={target}
                            type="button"
                            className={`review__preset${
                              active ? ' review__preset--active' : ''
                            }`}
                            disabled={exporting}
                            onClick={() =>
                              setEdit((prev) => ({
                                ...prev,
                                cameraOverlay: applyCameraSnapPreset(
                                  prev.cameraOverlay,
                                  target,
                                ),
                              }))
                            }
                          >
                            <span className="review__preset-label">
                              {cameraSnapPresetLabel(target)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    <p className="review__hint">
                      Drag to move (magnetic snap to corners &amp; edges) · corner handles
                      resize with aspect lock
                      {matchCameraSnapTarget(edit.cameraOverlay) == null
                        ? ' (custom)'
                        : ''}
                      .
                    </p>
                  </div>

                  <div className="review__field">
                    <label className="review__label" htmlFor="cam-size">
                      Size {edit.cameraOverlay.sizePercent}%
                    </label>
                    <input
                      id="cam-size"
                      className="review__range"
                      type="range"
                      min={12}
                      max={40}
                      step={1}
                      value={edit.cameraOverlay.sizePercent}
                      disabled={exporting}
                      onChange={(e) =>
                        patchCamera({ sizePercent: Number(e.target.value) })
                      }
                    />
                  </div>

                  <div className="review__field">
                    <span className="review__label">Shape</span>
                    <div className="review__presets" role="group" aria-label="Camera shape">
                      {(['circle', 'rounded', 'rectangle'] as const).map((shape: CameraShape) => (
                        <button
                          key={shape}
                          type="button"
                          className={`review__preset${
                            edit.cameraOverlay.shape === shape
                              ? ' review__preset--active'
                              : ''
                          }`}
                          disabled={exporting}
                          onClick={() => patchCamera({ shape })}
                        >
                          <span className="review__preset-label">
                            {shape === 'circle'
                              ? 'Circle'
                              : shape === 'rounded'
                                ? 'Rounded'
                                : 'Rectangle'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="review__toggle">
                    <input
                      type="checkbox"
                      checked={edit.cameraOverlay.shadowEnabled}
                      disabled={exporting}
                      onChange={(e) => patchCamera({ shadowEnabled: e.target.checked })}
                    />
                    <span>Camera soft shadow</span>
                  </label>

                  <label className="review__toggle">
                    <input
                      type="checkbox"
                      checked={edit.cameraOverlay.borderEnabled}
                      disabled={exporting}
                      onChange={(e) => patchCamera({ borderEnabled: e.target.checked })}
                    />
                    <span>Camera outline</span>
                  </label>

                  <label className="review__toggle">
                    <input
                      type="checkbox"
                      checked={edit.cameraOverlay.mirrored}
                      disabled={exporting}
                      onChange={(e) => patchCamera({ mirrored: e.target.checked })}
                    />
                    <span>Mirror camera (selfie)</span>
                  </label>

                  <div className="review__field">
                    <label className="review__label" htmlFor="cam-opacity">
                      Opacity {Math.round(edit.cameraOverlay.opacity * 100)}%
                    </label>
                    <input
                      id="cam-opacity"
                      className="review__range"
                      type="range"
                      min={35}
                      max={100}
                      step={1}
                      value={Math.round(edit.cameraOverlay.opacity * 100)}
                      disabled={exporting}
                      onChange={(e) =>
                        patchCamera({ opacity: Number(e.target.value) / 100 })
                      }
                    />
                  </div>

                  {edit.cameraOverlay.borderEnabled ? (
                    <>
                      <div className="review__field">
                        <label className="review__label" htmlFor="cam-border">
                          Outline {edit.cameraOverlay.borderWidthPx}px
                        </label>
                        <input
                          id="cam-border"
                          className="review__range"
                          type="range"
                          min={1}
                          max={6}
                          step={1}
                          value={edit.cameraOverlay.borderWidthPx}
                          disabled={exporting}
                          onChange={(e) =>
                            patchCamera({ borderWidthPx: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div className="review__field">
                        <span className="review__label" id="cam-border-color-label">
                          Outline color
                        </span>
                        <div
                          className="review__color-swatches"
                          role="listbox"
                          aria-labelledby="cam-border-color-label"
                        >
                          {CAMERA_BORDER_COLOR_PRESETS.map((preset) => {
                            const active =
                              edit.cameraOverlay.borderColor.toUpperCase() ===
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
                                    ? 'review__color-swatch review__color-swatch--active'
                                    : 'review__color-swatch'
                                }
                                style={{ background: preset.color }}
                                disabled={exporting}
                                onClick={() => patchCamera({ borderColor: preset.color })}
                              />
                            )
                          })}
                          <label
                            className="review__color-swatch review__color-swatch--custom"
                            title="Custom color"
                          >
                            <span className="visually-hidden">Custom outline color</span>
                            <input
                              type="color"
                              value={edit.cameraOverlay.borderColor}
                              disabled={exporting}
                              onChange={(e) => patchCamera({ borderColor: e.target.value })}
                            />
                          </label>
                        </div>
                      </div>
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <EmptyHint copy={TOOLTIPS['camera-review-empty']} className="review__hint" />
          )}

          <div className="review__field">
            <label className="review__label" htmlFor="trim-start">
              Trim start {formatTimeMs(edit.trimStartMs)}
            </label>
            <input
              id="trim-start"
              className="review__range"
              type="range"
              min={0}
              max={Math.max(0, durationMs - 100)}
              step={50}
              value={edit.trimStartMs}
              disabled={exporting || durationMs <= 0}
              onChange={(e) => {
                const startMs = Number(e.target.value)
                setEdit((prev) => ({
                  ...prev,
                  trimStartMs: startMs,
                  trimEndMs: Math.max(prev.trimEndMs, startMs + 100),
                }))
              }}
            />
          </div>

          <div className="review__field">
            <label className="review__label" htmlFor="trim-end">
              Trim end {formatTimeMs(edit.trimEndMs)}
            </label>
            <input
              id="trim-end"
              className="review__range"
              type="range"
              min={Math.min(edit.trimStartMs + 100, durationMs)}
              max={Math.max(edit.trimStartMs + 100, durationMs)}
              step={50}
              value={edit.trimEndMs}
              disabled={exporting || durationMs <= 0}
              onChange={(e) => {
                const endMs = Number(e.target.value)
                setEdit((prev) => ({
                  ...prev,
                  trimEndMs: endMs,
                  trimStartMs: Math.min(prev.trimStartMs, endMs - 100),
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

          <div className="review__field">
            <span className="review__label" id="beautify-label">
              One-click beautify
            </span>
            <div className="review__presets" role="group" aria-labelledby="beautify-label">
              {BEAUTIFY_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="review__preset"
                  disabled={exporting}
                  title={preset.hint}
                  onClick={() =>
                    setEdit((prev) =>
                      applyBeautifyPreset(prev, preset.id as BeautifyPresetId, {
                        hasCameraTrack,
                      }),
                    )
                  }
                >
                  <span className="review__preset-label">{preset.label}</span>
                </button>
              ))}
            </div>
            <p className="review__hint">
              Instant polished look — zoom, cursor, background, and quality in one tap.
            </p>
          </div>

          <div className="review__field">
            <span className="review__label" id="export-quality-label">
              Export quality
            </span>
            <div
              className="review__presets"
              role="group"
              aria-labelledby="export-quality-label"
            >
              {EXPORT_QUALITY_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`review__preset${
                    edit.exportQuality === preset.id ? ' review__preset--active' : ''
                  }`}
                  disabled={exporting}
                  onClick={() =>
                    setEdit((prev) => ({
                      ...prev,
                      exportQuality: preset.id,
                    }))
                  }
                >
                  <span className="review__preset-label">{preset.label}</span>
                </button>
              ))}
            </div>
            <p className="review__hint">
              {getExportQualityPreset(edit.exportQuality).hint}
            </p>
          </div>

          <div className="review__coming">
            <p className="review__coming-title">Keyboard</p>
            <ul className="review__shortcuts">
              {shortcutsForContext(exporting ? 'exporting' : 'review').map((s) => (
                <li key={`${s.id}-${s.keys}`}>
                  <kbd className="kbd">{s.keys}</kbd> {s.description}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
