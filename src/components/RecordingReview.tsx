import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ExportProgressEvent } from '../../shared/ipc'
import type { CursorEvent } from '../../shared/cursor'
import {
  CURSOR_STYLE_OPTIONS,
  clampCursorSizeScale,
  type CursorStyleId,
} from '../../shared/cursorAppearance'
import { defaultReviewEdit, formatTimeMs, withKeepRanges, type ReviewEditState } from '../../shared/edit'
import {
  EDIT_HISTORY_COALESCE_MS,
  canRedo,
  canUndo,
  createEditHistory,
  pushEdit,
  redoEdit,
  undoEdit,
  type EditHistory,
} from '../../shared/editHistory'
import {
  BEAUTIFY_PRESETS,
  applyBeautifyPreset,
  type BeautifyPresetId,
} from '../../shared/beautify'
import {
  BACKGROUND_FRAME_LAYOUTS,
  BACKGROUND_PRESETS,
  applyBackgroundFrameLayout,
  matchBackgroundFrameLayout,
} from '../../shared/background'
import { loadBackgroundPrefs, saveBackgroundPrefs } from '../../shared/backgroundPrefs'
import { loadCursorPrefs, saveCursorPrefs } from '../../shared/cursorPrefs'
import { loadExportPrefs, saveExportPrefs } from '../../shared/exportPrefs'
import {
  EXPORT_QUALITY_PRESETS,
  getExportQualityPreset,
} from '../../shared/exportQuality'
import {
  EXPORT_FORMAT_PRESETS,
  getExportFormatPreset,
} from '../../shared/exportFormat'
import {
  CAMERA_BORDER_COLOR_PRESETS,
  CAMERA_SIZE_PRESETS,
  CAMERA_SNAP_PRESETS,
  DEFAULT_CAMERA_OVERLAY,
  applyCameraSizePreset,
  applyCameraSnapPreset,
  cameraShapeAllowsFreeAspect,
  cameraSnapPresetLabel,
  matchCameraSizePreset,
  matchCameraSnapTarget,
  normalizeCameraOverlay,
  resetCameraLayout,
  type CameraOverlayStyle,
  type CameraShape,
} from '../../shared/camera'
import type { CameraSyncMeta } from '../../shared/cameraSync'
import {
  isCameraActiveAtMs,
  isCameraActiveRangesNever,
  materializeCameraActiveRanges,
  removeCameraActiveRangeAt,
  screenTimelineMsToWallMs,
  toggleCameraActiveAtWallMs,
} from '../../shared/cameraSync'
import { wallMsToScreenTimelineMs } from '../../shared/timelineMarkers'
import {
  isEditableTarget,
  matchShortcut,
  shortcutsForContext,
} from '../../shared/shortcuts'
import {
  cutAfterPlayhead,
  cutBeforePlayhead,
  markInAtPlayhead,
  markOutAtPlayhead,
} from '../../shared/timelineCut'
import {
  applyTrimToKeepRanges,
  canSplitKeepRangesAtPlayhead,
  deleteKeepRangeWithRipple,
  findKeepRangeIndex,
  normalizeKeepRanges,
  splitKeepRangesAtPlayhead,
  totalKeepDurationMs,
} from '../../shared/keepRanges'
import { buildZoomSegments } from '../../shared/autozoom'
import {
  buildCursorKeyframes,
  getSmoothedCursorAtTime,
} from '../../shared/cursorSmoothing'
import {
  clampZoomPeakScale,
  countEnabledManualZoomPoints,
  countEnabledZoomPoints,
  createManualZoomPoint,
  isZoomPointEnabled,
  nudgeZoomFocus,
  removeManualZoomPoint,
  resolveZoomPointFocus,
  resolveZoomPointPeakScale,
  upsertManualZoomPoint,
  upsertZoomPointOverride,
  type ZoomFocusNudgeDirection,
} from '../../shared/zoomPoints'
import {
  collapseAllEditorPanels,
  expandAllEditorPanels,
  toggleEditorPanel,
  type EditorChromeState,
  type EditorPanelId,
} from '../../shared/editorPanels'
import { loadEditorPanelPrefs, saveEditorPanelPrefs } from '../../shared/editorPanelPrefs'
import { loadTimelinePrefs, saveTimelinePrefs } from '../../shared/timelinePrefs'
import { AutoZoomPlayback } from './AutoZoomPlayback'
import { CameraLayoutMap } from './CameraLayoutMap'
import { EditorPanel } from './EditorPanel'
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
  const [playheadMs, setPlayheadMs] = useState(0)
  const [editHistory, setEditHistory] = useState<EditHistory<ReviewEditState>>(() => {
    const exportPrefs = loadExportPrefs()
    return createEditHistory(
      defaultReviewEdit(
        recordedDurationMs,
        {
          ...initialCameraOverlay,
          // Only enable in review when a camera track exists.
          enabled: Boolean(cameraMediaUrl) && initialCameraOverlay.enabled,
        },
        exportPrefs.quality,
        loadBackgroundPrefs(),
        loadCursorPrefs(),
        exportPrefs.format,
      ),
    )
  })
  const edit = editHistory.present
  const [editorChrome, setEditorChrome] = useState<EditorChromeState>(() =>
    loadEditorPanelPrefs(),
  )
  const [timelinePrefs, setTimelinePrefs] = useState(() => loadTimelinePrefs())

  function setEdit(
    updater: ReviewEditState | ((prev: ReviewEditState) => ReviewEditState),
  ) {
    setEditHistory((history) => {
      const next =
        typeof updater === 'function' ? updater(history.present) : updater
      return pushEdit(history, next, { coalesceMs: EDIT_HISTORY_COALESCE_MS })
    })
  }

  function undoReviewEdit() {
    if (exporting) return
    setEditHistory((history) => undoEdit(history))
  }

  function redoReviewEdit() {
    if (exporting) return
    setEditHistory((history) => redoEdit(history))
  }

  function togglePanel(id: EditorPanelId) {
    setEditorChrome((prev) => ({
      ...prev,
      panels: toggleEditorPanel(prev.panels, id),
    }))
  }

  function setSidebarCollapsed(collapsed: boolean) {
    setEditorChrome((prev) => ({ ...prev, sidebarCollapsed: collapsed }))
  }

  const hasCameraTrack = Boolean(cameraMediaUrl)
  const editRef = useRef(edit)
  const playheadMsRef = useRef(0)
  const durationMsRef = useRef(durationMs)
  const rippleDeleteRef = useRef(timelinePrefs.rippleDeleteEnabled)
  const onCameraOverlayChangeRef = useRef(onCameraOverlayChange)

  useEffect(() => {
    saveBackgroundPrefs(edit.background)
  }, [edit.background])

  useEffect(() => {
    saveCursorPrefs(edit.cursorAppearance)
  }, [edit.cursorAppearance])

  useEffect(() => {
    saveExportPrefs({
      format: edit.exportFormat,
      quality: edit.exportQuality,
    })
  }, [edit.exportFormat, edit.exportQuality])

  useEffect(() => {
    saveEditorPanelPrefs(editorChrome)
  }, [editorChrome])

  useEffect(() => {
    saveTimelinePrefs(timelinePrefs)
  }, [timelinePrefs])

  useEffect(() => {
    rippleDeleteRef.current = timelinePrefs.rippleDeleteEnabled
  }, [timelinePrefs.rippleDeleteEnabled])

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

  const enabledZoomCount =
    countEnabledZoomPoints(zoomSegments.length, edit.zoomPointOverrides) +
    countEnabledManualZoomPoints(edit.manualZoomPoints)

  const totalZoomSlots =
    zoomSegments.length + edit.manualZoomPoints.length

  useEffect(() => {
    editRef.current = edit
  }, [edit])

  useEffect(() => {
    playheadMsRef.current = playheadMs
  }, [playheadMs])

  useEffect(() => {
    durationMsRef.current = durationMs
  }, [durationMs])

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

  function focusAtPlayhead(tMs: number): { focusX: number; focusY: number } {
    const keyframes = buildCursorKeyframes(cursorEvents)
    if (keyframes.length === 0) return { focusX: 0.5, focusY: 0.5 }
    const pos = getSmoothedCursorAtTime(
      tMs,
      keyframes,
      { width: 1920, height: 1080 },
      captureGeometry ? { geometry: captureGeometry } : {},
    )
    if (!pos) return { focusX: 0.5, focusY: 0.5 }
    return { focusX: pos.x, focusY: pos.y }
  }

  function addZoomAtPlayhead() {
    if (exporting) return
    const tMs = playheadMsRef.current
    const focus = focusAtPlayhead(tMs)
    setEdit((prev) => ({
      ...prev,
      autoZoomEnabled: true,
      manualZoomPoints: upsertManualZoomPoint(
        prev.manualZoomPoints,
        createManualZoomPoint({
          peakMs: tMs,
          focusX: focus.focusX,
          focusY: focus.focusY,
        }),
      ),
    }))
  }

  const deleteSegmentAtPlayhead = useCallback(() => {
    if (exporting) return
    const ph = playheadMsRef.current
    const full = durationMsRef.current
    const ranges = normalizeKeepRanges(editRef.current.keepRanges, full)
    const result = deleteKeepRangeWithRipple(
      ranges,
      ph,
      full,
      rippleDeleteRef.current,
    )
    if (!result) return
    setEdit((prev) => withKeepRanges(prev, result.ranges, full))
    if (result.playheadMs != null) {
      setPlayheadMs(result.playheadMs)
    }
  }, [exporting])

  function nudgeClickZoomFocus(
    index: number,
    direction: ZoomFocusNudgeDirection,
    shift: boolean,
  ) {
    if (exporting) return
    setEdit((prev) => {
      const seg = zoomSegments[index]
      if (!seg) return prev
      const current = resolveZoomPointFocus(seg, index, prev.zoomPointOverrides)
      const next = nudgeZoomFocus(current.focusX, current.focusY, direction, {
        shift,
      })
      const peak = resolveZoomPointPeakScale(seg, index, prev.zoomPointOverrides)
      return {
        ...prev,
        zoomPointOverrides: upsertZoomPointOverride(prev.zoomPointOverrides, {
          index,
          enabled: true,
          peakScale: peak,
          focusX: next.focusX,
          focusY: next.focusY,
        }),
      }
    })
  }

  function nudgeManualZoomFocus(
    id: string,
    direction: ZoomFocusNudgeDirection,
    shift: boolean,
  ) {
    if (exporting) return
    setEdit((prev) => {
      const point = prev.manualZoomPoints.find((p) => p.id === id)
      if (!point) return prev
      const next = nudgeZoomFocus(point.focusX, point.focusY, direction, {
        shift,
      })
      return {
        ...prev,
        manualZoomPoints: upsertManualZoomPoint(prev.manualZoomPoints, {
          ...point,
          focusX: next.focusX,
          focusY: next.focusY,
        }),
      }
    })
  }

  const addZoomAtPlayheadRef = useRef(addZoomAtPlayhead)
  useEffect(() => {
    addZoomAtPlayheadRef.current = addZoomAtPlayhead
  })

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
      if (action === 'undo') {
        event.preventDefault()
        setEditHistory((history) => undoEdit(history))
        return
      }
      if (action === 'redo') {
        event.preventDefault()
        setEditHistory((history) => redoEdit(history))
        return
      }
      if (action === 'add-zoom') {
        event.preventDefault()
        addZoomAtPlayheadRef.current()
        return
      }
      if (
        action === 'mark-in' ||
        action === 'mark-out' ||
        action === 'cut-after' ||
        action === 'cut-before'
      ) {
        event.preventDefault()
        const ph = playheadMsRef.current
        const full = durationMsRef.current
        setEdit((prev) => {
          const trim = { startMs: prev.trimStartMs, endMs: prev.trimEndMs }
          const next =
            action === 'mark-in'
              ? markInAtPlayhead(trim, ph, full)
              : action === 'mark-out'
                ? markOutAtPlayhead(trim, ph, full)
                : action === 'cut-after'
                  ? cutAfterPlayhead(trim, ph, full)
                  : cutBeforePlayhead(trim, ph, full)
          if (next.startMs === prev.trimStartMs && next.endMs === prev.trimEndMs) {
            return prev
          }
          // Mark/cut collapse to a single keep window (classic trim).
          return withKeepRanges(prev, [next], full)
        })
        return
      }
      if (action === 'split-segment') {
        event.preventDefault()
        const ph = playheadMsRef.current
        const full = durationMsRef.current
        setEdit((prev) => {
          const ranges = normalizeKeepRanges(prev.keepRanges, full)
          const next = splitKeepRangesAtPlayhead(ranges, ph, full)
          if (!next) return prev
          return withKeepRanges(prev, next, full)
        })
        return
      }
      if (action === 'delete-segment') {
        event.preventDefault()
        deleteSegmentAtPlayhead()
        return
      }
      if (action === 'discard') {
        event.preventDefault()
        onDiscard()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteSegmentAtPlayhead, exporting, hasCameraTrack, onCancelExport, onDiscard, onExport])

  function patchCamera(partial: Partial<CameraOverlayStyle>) {
    setEdit((prev) => ({
      ...prev,
      cameraOverlay: normalizeCameraOverlay({ ...prev.cameraOverlay, ...partial }),
    }))
  }

  const cameraWallDurationMs = Math.max(
    cameraSync?.wallDurationMs ?? 0,
    durationMs + Math.max(0, cameraSync?.screenFirstChunkMs ?? 0),
  )

  const resolvedCameraRanges =
    edit.cameraActiveRangesOverride !== null
      ? edit.cameraActiveRangesOverride
      : (cameraSync?.activeRanges ?? [])

  const cameraActiveAtPlayhead = isCameraActiveAtMs(
    resolvedCameraRanges,
    screenTimelineMsToWallMs(playheadMs, cameraSync?.screenFirstChunkMs),
    cameraWallDurationMs,
  )

  const cameraRangeWindows =
    resolvedCameraRanges.length === 0 || isCameraActiveRangesNever(resolvedCameraRanges)
      ? []
      : materializeCameraActiveRanges(resolvedCameraRanges, cameraWallDurationMs).filter(
          (r) => (r.endMs ?? 0) - r.startMs >= 20,
        )

  function toggleCameraAtPlayhead() {
    if (exporting || !hasCameraTrack) return
    const wallMs = screenTimelineMsToWallMs(
      playheadMsRef.current,
      cameraSync?.screenFirstChunkMs,
    )
    setEdit((prev) => {
      const base =
        prev.cameraActiveRangesOverride !== null
          ? prev.cameraActiveRangesOverride
          : (cameraSync?.activeRanges ?? [])
      return {
        ...prev,
        cameraActiveRangesOverride: toggleCameraActiveAtWallMs(
          base,
          wallMs,
          cameraWallDurationMs,
        ),
      }
    })
  }

  function removeCameraRange(index: number) {
    if (exporting) return
    setEdit((prev) => {
      const base =
        prev.cameraActiveRangesOverride !== null
          ? prev.cameraActiveRangesOverride
          : materializeCameraActiveRanges(
              cameraSync?.activeRanges,
              cameraWallDurationMs,
            )
      return {
        ...prev,
        cameraActiveRangesOverride: removeCameraActiveRangeAt(base, index),
      }
    })
  }

  function resetCameraRanges() {
    if (exporting) return
    setEdit((prev) => ({ ...prev, cameraActiveRangesOverride: null }))
  }

  function setCameraRangesAlwaysOn() {
    if (exporting) return
    setEdit((prev) => ({ ...prev, cameraActiveRangesOverride: [] }))
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

  const keepRanges = normalizeKeepRanges(edit.keepRanges, durationMs)
  const trimDurationMs = totalKeepDurationMs(keepRanges)
  const canSplit = canSplitKeepRangesAtPlayhead(keepRanges, playheadMs, durationMs)
  const canDeleteSegment =
    keepRanges.length > 1 && findKeepRangeIndex(keepRanges, playheadMs) >= 0
  const activeSegmentIndex = findKeepRangeIndex(keepRanges, playheadMs)

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
          <Tooltip copy={TOOLTIPS['edit-undo']}>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={exporting || !canUndo(editHistory)}
              onClick={undoReviewEdit}
              aria-label="Undo"
            >
              Undo
            </button>
          </Tooltip>
          <Tooltip copy={TOOLTIPS['edit-redo']}>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={exporting || !canRedo(editHistory)}
              onClick={redoReviewEdit}
              aria-label="Redo"
            >
              Redo
            </button>
          </Tooltip>
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
              {exporting ? 'Exporting…' : `Export ${getExportFormatPreset(edit.exportFormat).label}`}
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
            manualZoomPoints={edit.manualZoomPoints}
            cursorSmoothingEnabled={edit.cursorSmoothingEnabled}
            cursorAppearance={edit.cursorAppearance}
            background={edit.background}
            cameraMediaUrl={cameraMediaUrl}
            cameraSync={cameraSync}
            cameraActiveRangesOverride={edit.cameraActiveRangesOverride}
            cameraOverlay={edit.cameraOverlay}
            onCameraLayoutChange={(next) =>
              setEdit((prev) => ({
                ...prev,
                cameraOverlay: normalizeCameraOverlay(next),
              }))
            }
            onCameraActiveRangesChange={(ranges) => {
              if (exporting) return
              setEdit((prev) => ({
                ...prev,
                cameraActiveRangesOverride: ranges,
              }))
            }}
            trimStartMs={edit.trimStartMs}
            trimEndMs={edit.trimEndMs}
            keepRanges={keepRanges}
            magneticSnapEnabled={timelinePrefs.magneticSnapEnabled}
            onDurationMs={onDurationMs}
            onTimeMs={setPlayheadMs}
          />
        </section>

        {editorChrome.sidebarCollapsed ? (
          <div className="review__editor-collapsed" aria-label="Editor collapsed">
            <button
              type="button"
              className="btn btn--ghost review__editor-expand"
              onClick={() => setSidebarCollapsed(false)}
              title="Show edit panel"
            >
              Edit ▸
            </button>
          </div>
        ) : (
        <aside className="review__editor" aria-label="Edit recording">
          <div className="review__editor-chrome">
            <h3 className="review__panel-title">Edit</h3>
            <div className="review__editor-chrome-actions">
              <button
                type="button"
                className="btn btn--ghost review__chrome-btn"
                onClick={() =>
                  setEditorChrome((prev) => ({
                    ...prev,
                    panels: expandAllEditorPanels(),
                  }))
                }
                title="Expand all panels"
              >
                Expand
              </button>
              <button
                type="button"
                className="btn btn--ghost review__chrome-btn"
                onClick={() =>
                  setEditorChrome((prev) => ({
                    ...prev,
                    panels: collapseAllEditorPanels(),
                  }))
                }
                title="Collapse all panels"
              >
                Collapse
              </button>
              <button
                type="button"
                className="btn btn--ghost review__chrome-btn"
                onClick={() => setSidebarCollapsed(true)}
                title="Hide edit panel"
              >
                Hide
              </button>
            </div>
          </div>

          <EditorPanel
            id="zoom"
            open={editorChrome.panels.zoom}
            onToggle={togglePanel}
            summary={
              edit.autoZoomEnabled
                ? `${enabledZoomCount}/${totalZoomSlots} on`
                : 'Off'
            }
          >
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
                  Zoom points · {enabledZoomCount}/{totalZoomSlots} on
                </span>
                <div className="review__zoom-actions">
                  <button
                    type="button"
                    className="btn btn--ghost review__zoom-add"
                    disabled={exporting}
                    title={`Add zoom at ${formatTimeMs(playheadMs)} (Z)`}
                    onClick={addZoomAtPlayhead}
                  >
                    Add at playhead · {formatTimeMs(playheadMs)}
                  </button>
                </div>
                {zoomSegments.length === 0 && edit.manualZoomPoints.length === 0 ? (
                  <p className="review__hint">
                    No zooms yet — record with clicks, or press Z / Add at playhead.
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
                      const focus = resolveZoomPointFocus(
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
                                      focusX: focus.focusX,
                                      focusY: focus.focusY,
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
                            <>
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
                                          focusX: focus.focusX,
                                          focusY: focus.focusY,
                                        },
                                      ),
                                    }))
                                  }
                                />
                              </div>
                              <ZoomFocusNudgePad
                                label={`Focus ${Math.round(focus.focusX * 100)}%, ${Math.round(focus.focusY * 100)}%`}
                                disabled={exporting}
                                onNudge={(direction, shift) =>
                                  nudgeClickZoomFocus(index, direction, shift)
                                }
                              />
                            </>
                          ) : null}
                        </li>
                      )
                    })}
                    {edit.manualZoomPoints.map((point, manualIndex) => (
                      <li
                        key={point.id}
                        className={`review__zoom-item${
                          point.enabled ? '' : ' review__zoom-item--off'
                        }`}
                      >
                        <label className="review__toggle review__toggle--nested">
                          <input
                            type="checkbox"
                            checked={point.enabled}
                            disabled={exporting}
                            onChange={(e) =>
                              setEdit((prev) => ({
                                ...prev,
                                manualZoomPoints: upsertManualZoomPoint(
                                  prev.manualZoomPoints,
                                  { ...point, enabled: e.target.checked },
                                ),
                              }))
                            }
                          />
                          <span>
                            Manual {manualIndex + 1} · {formatTimeMs(point.peakMs)}
                          </span>
                        </label>
                        {point.enabled ? (
                          <>
                            <div className="review__field review__field--compact">
                              <label
                                className="review__label"
                                htmlFor={`manual-zoom-scale-${point.id}`}
                              >
                                Scale {point.peakScale.toFixed(1)}×
                              </label>
                              <input
                                id={`manual-zoom-scale-${point.id}`}
                                className="review__range"
                                type="range"
                                min={1.1}
                                max={3}
                                step={0.1}
                                value={point.peakScale}
                                disabled={exporting}
                                onChange={(e) =>
                                  setEdit((prev) => ({
                                    ...prev,
                                    manualZoomPoints: upsertManualZoomPoint(
                                      prev.manualZoomPoints,
                                      {
                                        ...point,
                                        peakScale: clampZoomPeakScale(
                                          Number(e.target.value),
                                        ),
                                      },
                                    ),
                                  }))
                                }
                              />
                            </div>
                            <ZoomFocusNudgePad
                              label={`Focus ${Math.round(point.focusX * 100)}%, ${Math.round(point.focusY * 100)}%`}
                              disabled={exporting}
                              onNudge={(direction, shift) =>
                                nudgeManualZoomFocus(point.id, direction, shift)
                              }
                            />
                          </>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn--ghost review__zoom-remove"
                          disabled={exporting}
                          onClick={() =>
                            setEdit((prev) => ({
                              ...prev,
                              manualZoomPoints: removeManualZoomPoint(
                                prev.manualZoomPoints,
                                point.id,
                              ),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {totalZoomSlots > 0 ? (
                  <p className="review__hint">
                    Toggle points, tweak scale, or nudge focus (Shift = larger step) —
                    preview and export stay in sync. Press Z to add a zoom at the
                    playhead (focus follows cursor).
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          </EditorPanel>

          <EditorPanel
            id="cursor"
            open={editorChrome.panels.cursor}
            onToggle={togglePanel}
            summary={
              edit.cursorSmoothingEnabled
                ? edit.cursorAppearance.style
                : 'Off'
            }
          >
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
                  <label className="review__toggle review__toggle--nested">
                    <input
                      type="checkbox"
                      checked={edit.cursorAppearance.clickHighlightEnabled}
                      disabled={exporting}
                      onChange={(e) =>
                        setEdit((prev) => ({
                          ...prev,
                          cursorAppearance: {
                            ...prev.cursorAppearance,
                            clickHighlightEnabled: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span>Auto-highlight clicks</span>
                  </label>
                </>
              ) : null}
            </>
          ) : null}

          </EditorPanel>

          <EditorPanel
            id="background"
            open={editorChrome.panels.background}
            onToggle={togglePanel}
            summary={edit.background.enabled ? 'On' : 'Off'}
          >
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
                <span className="review__label">Frame layout</span>
                <div
                  className="review__presets review__presets--size"
                  role="group"
                  aria-label="Background frame layout"
                >
                  {BACKGROUND_FRAME_LAYOUTS.map((layout) => {
                    const active =
                      matchBackgroundFrameLayout(edit.background) === layout.id
                    return (
                      <button
                        key={layout.id}
                        type="button"
                        className={`review__preset${
                          active ? ' review__preset--active' : ''
                        }`}
                        disabled={exporting}
                        title={layout.hint}
                        onClick={() =>
                          setEdit((prev) => ({
                            ...prev,
                            background: applyBackgroundFrameLayout(
                              prev.background,
                              layout.id,
                            ),
                          }))
                        }
                      >
                        <span className="review__preset-label">{layout.label}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="review__hint">
                  Compact / Standard / Wide set padding + corners; Flat drops shadow.
                </p>
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

              <div className="review__field">
                <label className="review__label" htmlFor="bg-radius">
                  Corner radius {edit.background.cornerRadiusPx}px
                </label>
                <input
                  id="bg-radius"
                  className="review__range"
                  type="range"
                  min={0}
                  max={28}
                  step={1}
                  value={edit.background.cornerRadiusPx}
                  disabled={exporting}
                  onChange={(e) =>
                    setEdit((prev) => ({
                      ...prev,
                      background: {
                        ...prev.background,
                        cornerRadiusPx: Number(e.target.value),
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

          </EditorPanel>

          <EditorPanel
            id="camera"
            open={editorChrome.panels.camera}
            onToggle={togglePanel}
            summary={
              !hasCameraTrack
                ? 'None'
                : edit.cameraOverlay.enabled
                  ? 'On'
                  : 'Off'
            }
          >
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
                  <div className="review__field review__camera-ranges" aria-label="Camera active windows">
                    <span className="review__label">
                      Camera windows
                      {edit.cameraActiveRangesOverride !== null ? ' · edited' : ''}
                    </span>
                    <div className="review__zoom-actions">
                      <button
                        type="button"
                        className="btn btn--ghost review__zoom-add"
                        disabled={exporting}
                        title={
                          cameraActiveAtPlayhead
                            ? `Hide camera from ${formatTimeMs(playheadMs)}`
                            : `Show camera from ${formatTimeMs(playheadMs)}`
                        }
                        onClick={toggleCameraAtPlayhead}
                      >
                        {cameraActiveAtPlayhead ? 'Hide' : 'Show'} from playhead ·{' '}
                        {formatTimeMs(playheadMs)}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost review__zoom-add"
                        disabled={exporting || edit.cameraActiveRangesOverride === null}
                        title="Restore windows from the recording"
                        onClick={resetCameraRanges}
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost review__zoom-add"
                        disabled={exporting}
                        title="Show camera for the whole clip"
                        onClick={setCameraRangesAlwaysOn}
                      >
                        Always on
                      </button>
                    </div>
                    {isCameraActiveRangesNever(resolvedCameraRanges) ? (
                      <p className="review__hint">
                        Camera hidden for the whole clip — Show from playhead to bring it back.
                      </p>
                    ) : resolvedCameraRanges.length === 0 ? (
                      <p className="review__hint">
                        Always on (no mute windows). Hide from playhead to trim visibility.
                      </p>
                    ) : (
                      <ul className="review__zoom-list">
                        {cameraRangeWindows.map((range, index) => {
                          const startScreen = wallMsToScreenTimelineMs(
                            range.startMs,
                            cameraSync?.screenFirstChunkMs,
                          )
                          const endScreen = wallMsToScreenTimelineMs(
                            range.endMs ?? cameraWallDurationMs,
                            cameraSync?.screenFirstChunkMs,
                          )
                          return (
                            <li
                              key={`camera-range-${index}-${range.startMs}`}
                              className="review__zoom-item"
                            >
                              <span className="review__zoom-meta">
                                Camera {index + 1} · {formatTimeMs(startScreen)}–
                                {formatTimeMs(endScreen)}
                              </span>
                              <button
                                type="button"
                                className="btn btn--ghost review__zoom-remove"
                                disabled={exporting}
                                onClick={() => removeCameraRange(index)}
                              >
                                Remove
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    <p className="review__hint">
                      Amber timeline spans match these windows — drag edges to trim · preview =
                      export.
                    </p>
                  </div>

                  <div className="review__field">
                    <span className="review__label">Position</span>
                    {/*
                      Same chrome schematic as setup/recording — click-to-place
                      uses relative coords identical to preview bubble + export.
                    */}
                    <CameraLayoutMap
                      style={edit.cameraOverlay}
                      disabled={exporting}
                      onLayoutChange={(next) =>
                        setEdit((prev) => ({
                          ...prev,
                          cameraOverlay: normalizeCameraOverlay(next),
                        }))
                      }
                    />
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
                      Click a layout-map snap guide or drag the map/bubble (magnetic snap) ·
                      scroll map to resize · focus map/bubble: arrows nudge · +/- resize ·
                      [ ] snap · C shape · 0 or double-click reset · bubble 1/2/3 size · map
                      7/9/1/3/5 corners · corner handles resize
                      {edit.cameraOverlay.lockAspect
                        ? ' with aspect lock'
                        : ' freely (unlocked)'}
                      {matchCameraSnapTarget(edit.cameraOverlay) == null
                        ? ' (custom)'
                        : ''}
                      .
                    </p>
                  </div>

                  <div className="review__field">
                    <label className="review__label" htmlFor="cam-size">
                      {edit.cameraOverlay.lockAspect
                        ? `Size ${edit.cameraOverlay.sizePercent}%`
                        : `Width ${edit.cameraOverlay.sizePercent}%`}
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
                        patchCamera({
                          sizePercent: Number(e.target.value),
                          heightPercent: edit.cameraOverlay.lockAspect
                            ? Number(e.target.value)
                            : edit.cameraOverlay.heightPercent,
                        })
                      }
                    />
                    <div
                      className="review__presets review__presets--size"
                      role="group"
                      aria-label="Camera size presets"
                    >
                      {CAMERA_SIZE_PRESETS.map((preset) => {
                        const active =
                          matchCameraSizePreset(edit.cameraOverlay) === preset.id
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            className={`review__preset${
                              active ? ' review__preset--active' : ''
                            }`}
                            disabled={exporting}
                            title={`${preset.label} · ${preset.sizePercent}% (key ${
                              preset.id === 'small'
                                ? '1'
                                : preset.id === 'medium'
                                  ? '2'
                                  : '3'
                            })`}
                            onClick={() =>
                              setEdit((prev) => ({
                                ...prev,
                                cameraOverlay: applyCameraSizePreset(
                                  prev.cameraOverlay,
                                  preset.id,
                                ),
                              }))
                            }
                          >
                            <span className="review__preset-label">{preset.label}</span>
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        className="review__preset"
                        disabled={exporting}
                        title="Reset to bottom-right · medium (key 0 or double-click)"
                        onClick={() =>
                          setEdit((prev) => ({
                            ...prev,
                            cameraOverlay: resetCameraLayout(prev.cameraOverlay),
                          }))
                        }
                      >
                        <span className="review__preset-label">Reset</span>
                      </button>
                    </div>
                  </div>

                  {!edit.cameraOverlay.lockAspect &&
                  cameraShapeAllowsFreeAspect(edit.cameraOverlay.shape) ? (
                    <div className="review__field">
                      <label className="review__label" htmlFor="cam-height">
                        Height {edit.cameraOverlay.heightPercent}%
                      </label>
                      <input
                        id="cam-height"
                        className="review__range"
                        type="range"
                        min={12}
                        max={40}
                        step={1}
                        value={edit.cameraOverlay.heightPercent}
                        disabled={exporting}
                        onChange={(e) =>
                          patchCamera({
                            lockAspect: false,
                            heightPercent: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  ) : null}

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

                  {cameraShapeAllowsFreeAspect(edit.cameraOverlay.shape) ? (
                    <label className="review__toggle">
                      <input
                        type="checkbox"
                        checked={edit.cameraOverlay.lockAspect}
                        disabled={exporting}
                        onChange={(e) =>
                          patchCamera({
                            lockAspect: e.target.checked,
                            heightPercent: e.target.checked
                              ? edit.cameraOverlay.sizePercent
                              : edit.cameraOverlay.heightPercent,
                          })
                        }
                      />
                      <span>Lock aspect (square)</span>
                    </label>
                  ) : null}

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

          </EditorPanel>

          <EditorPanel
            id="timeline"
            open={editorChrome.panels.timeline}
            onToggle={togglePanel}
            summary={formatTimeMs(trimDurationMs)}
          >
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
                setEdit((prev) => {
                  const trim = {
                    startMs,
                    endMs: Math.max(prev.trimEndMs, startMs + 100),
                  }
                  const ranges = applyTrimToKeepRanges(prev.keepRanges, trim, durationMs)
                  return withKeepRanges(prev, ranges, durationMs)
                })
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
                setEdit((prev) => {
                  const trim = {
                    endMs,
                    startMs: Math.min(prev.trimStartMs, endMs - 100),
                  }
                  const ranges = applyTrimToKeepRanges(prev.keepRanges, trim, durationMs)
                  return withKeepRanges(prev, ranges, durationMs)
                })
              }}
            />
          </div>

          <div className="review__field review__field--compact">
            <Tooltip copy={TOOLTIPS['trim-ripple-delete']}>
              <label className="review__toggle">
                <input
                  type="checkbox"
                  checked={timelinePrefs.rippleDeleteEnabled}
                  disabled={exporting}
                  onChange={(e) =>
                    setTimelinePrefs((prev) => ({
                      ...prev,
                      rippleDeleteEnabled: e.target.checked,
                    }))
                  }
                />
                <span>Ripple delete</span>
              </label>
            </Tooltip>
            <p className="review__hint">
              {timelinePrefs.rippleDeleteEnabled
                ? 'Delete merges touching clips so the timeline closes up.'
                : 'Delete keeps razor edit points separate for fine cuts.'}
            </p>
          </div>

          <div className="review__field review__field--compact">
            <Tooltip copy={TOOLTIPS['trim-magnetic-snap']}>
              <label className="review__toggle">
                <input
                  type="checkbox"
                  checked={timelinePrefs.magneticSnapEnabled}
                  disabled={exporting}
                  onChange={(e) =>
                    setTimelinePrefs((prev) => ({
                      ...prev,
                      magneticSnapEnabled: e.target.checked,
                    }))
                  }
                />
                <span>Magnetic snap</span>
              </label>
            </Tooltip>
            <p className="review__hint">
              {timelinePrefs.magneticSnapEnabled
                ? 'Scrub sticks to keep edges, trim, zooms, clicks, and camera windows.'
                : 'Free scrub — playhead ignores nearby edit points.'}
            </p>
          </div>

          <div className="review__field review__field--compact">
            <span className="review__label" id="trim-cut-label">
              Cut at playhead · {formatTimeMs(playheadMs)}
            </span>
            <div className="review__presets" role="group" aria-labelledby="trim-cut-label">
              <Tooltip copy={TOOLTIPS['trim-mark-in']}>
                <button
                  type="button"
                  className="review__preset"
                  disabled={exporting || durationMs <= 0}
                  onClick={() =>
                    setEdit((prev) => {
                      const next = markInAtPlayhead(
                        { startMs: prev.trimStartMs, endMs: prev.trimEndMs },
                        playheadMs,
                        durationMs,
                      )
                      return withKeepRanges(prev, [next], durationMs)
                    })
                  }
                >
                  <span className="review__preset-label">In [</span>
                </button>
              </Tooltip>
              <Tooltip copy={TOOLTIPS['trim-mark-out']}>
                <button
                  type="button"
                  className="review__preset"
                  disabled={exporting || durationMs <= 0}
                  onClick={() =>
                    setEdit((prev) => {
                      const next = markOutAtPlayhead(
                        { startMs: prev.trimStartMs, endMs: prev.trimEndMs },
                        playheadMs,
                        durationMs,
                      )
                      return withKeepRanges(prev, [next], durationMs)
                    })
                  }
                >
                  <span className="review__preset-label">Out ]</span>
                </button>
              </Tooltip>
              <Tooltip copy={TOOLTIPS['trim-cut-after']}>
                <button
                  type="button"
                  className="review__preset"
                  disabled={exporting || durationMs <= 0}
                  onClick={() =>
                    setEdit((prev) => {
                      const next = cutAfterPlayhead(
                        { startMs: prev.trimStartMs, endMs: prev.trimEndMs },
                        playheadMs,
                        durationMs,
                      )
                      return withKeepRanges(prev, [next], durationMs)
                    })
                  }
                >
                  <span className="review__preset-label">Keep before · S</span>
                </button>
              </Tooltip>
              <Tooltip copy={TOOLTIPS['trim-cut-before']}>
                <button
                  type="button"
                  className="review__preset"
                  disabled={exporting || durationMs <= 0}
                  onClick={() =>
                    setEdit((prev) => {
                      const next = cutBeforePlayhead(
                        { startMs: prev.trimStartMs, endMs: prev.trimEndMs },
                        playheadMs,
                        durationMs,
                      )
                      return withKeepRanges(prev, [next], durationMs)
                    })
                  }
                >
                  <span className="review__preset-label">Keep after · ⇧S</span>
                </button>
              </Tooltip>
              <Tooltip copy={TOOLTIPS['trim-split']}>
                <button
                  type="button"
                  className="review__preset"
                  disabled={exporting || durationMs <= 0 || !canSplit}
                  onClick={() =>
                    setEdit((prev) => {
                      const next = splitKeepRangesAtPlayhead(
                        prev.keepRanges,
                        playheadMs,
                        durationMs,
                      )
                      if (!next) return prev
                      return withKeepRanges(prev, next, durationMs)
                    })
                  }
                >
                  <span className="review__preset-label">Split · X</span>
                </button>
              </Tooltip>
              <Tooltip copy={TOOLTIPS['trim-delete-segment']}>
                <button
                  type="button"
                  className="review__preset"
                  disabled={exporting || durationMs <= 0 || !canDeleteSegment}
                  onClick={deleteSegmentAtPlayhead}
                >
                  <span className="review__preset-label">Delete seg</span>
                </button>
              </Tooltip>
            </div>
          </div>

          {keepRanges.length > 1 ? (
            <div className="review__field review__field--compact">
              <span className="review__label">
                Keep ranges · {keepRanges.length}
                {activeSegmentIndex >= 0 ? ` · seg ${activeSegmentIndex + 1}` : ''}
              </span>
              <ul className="review__hint" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {keepRanges.map((r, i) => (
                  <li key={`${r.startMs}-${r.endMs}-${i}`}>
                    {i + 1}. {formatTimeMs(r.startMs)} → {formatTimeMs(r.endMs)}
                    {i === activeSegmentIndex ? ' ←' : ''}
                  </li>
                ))}
              </ul>
              <p className="review__hint">
                Gaps are skipped on preview playback and export (ffmpeg concat). Split (X) then
                Delete to cut the middle.
              </p>
            </div>
          ) : null}

          <p className="review__hint">
            Export length: {formatTimeMs(trimDurationMs)}
            {keepRanges.length > 1
              ? ` (${keepRanges.length} segments concatenated)`
              : edit.trimStartMs > 0 || edit.trimEndMs < durationMs
                ? ' (trim baked into MP4 export)'
                : ''}
          </p>

          </EditorPanel>

          <EditorPanel
            id="export"
            open={editorChrome.panels.export}
            onToggle={togglePanel}
            summary={`${getExportFormatPreset(edit.exportFormat).label} · ${getExportQualityPreset(edit.exportQuality).label}`}
          >
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
            <span className="review__label" id="export-format-label">
              Export format
            </span>
            <div
              className="review__presets"
              role="group"
              aria-labelledby="export-format-label"
            >
              {EXPORT_FORMAT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`review__preset${
                    edit.exportFormat === preset.id ? ' review__preset--active' : ''
                  }`}
                  disabled={exporting}
                  onClick={() =>
                    setEdit((prev) => ({
                      ...prev,
                      exportFormat: preset.id,
                    }))
                  }
                >
                  <span className="review__preset-label">{preset.label}</span>
                </button>
              ))}
            </div>
            <p className="review__hint">
              {getExportFormatPreset(edit.exportFormat).hint}
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
          </EditorPanel>
        </aside>
        )}
      </div>
    </div>
  )
}

const FOCUS_NUDGE_BUTTONS: {
  direction: ZoomFocusNudgeDirection
  label: string
  gridArea: string
}[] = [
  { direction: 'up', label: '↑', gridArea: 'up' },
  { direction: 'left', label: '←', gridArea: 'left' },
  { direction: 'right', label: '→', gridArea: 'right' },
  { direction: 'down', label: '↓', gridArea: 'down' },
]

function ZoomFocusNudgePad(props: {
  label: string
  disabled: boolean
  onNudge: (direction: ZoomFocusNudgeDirection, shift: boolean) => void
}) {
  const { label, disabled, onNudge } = props
  return (
    <div className="review__focus-nudge">
      <span className="review__label">{label}</span>
      <div
        className="review__focus-pad"
        role="group"
        aria-label="Nudge zoom focus"
      >
        {FOCUS_NUDGE_BUTTONS.map((btn) => (
          <button
            key={btn.direction}
            type="button"
            className="btn btn--ghost review__focus-btn"
            style={{ gridArea: btn.gridArea }}
            disabled={disabled}
            title={`Nudge focus ${btn.direction} (Shift = larger)`}
            aria-label={`Nudge focus ${btn.direction}`}
            onClick={(e) => onNudge(btn.direction, e.shiftKey)}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  )
}
