import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { CursorEvent } from '../../shared/cursor'
import {
  appearanceToCursorDrawOptions,
  DEFAULT_CURSOR_APPEARANCE,
  type CursorAppearance,
} from '../../shared/cursorAppearance'
import {
  buildZoomSegments,
  getZoomTransformAtTime,
  type VideoSize,
} from '../../shared/autozoom'
import {
  applyZoomPointOverrides,
  mergeZoomSegments,
  type ManualZoomPoint,
  type ZoomPointOverride,
} from '../../shared/zoomPoints'
import {
  buildClickRings,
  buildCursorKeyframes,
  getActiveClickHighlights,
  getActiveClickRings,
  getSmoothedCursorAtTime,
  type ActiveClickHighlight,
  type ActiveClickRing,
  type NormalizedPoint,
} from '../../shared/cursorSmoothing'
import { formatTimeMs } from '../../shared/edit'
import { resolveBackgroundFrame, type BackgroundStyle } from '../../shared/background'
import {
  DEFAULT_CAMERA_OVERLAY,
  type CameraOverlayStyle,
} from '../../shared/camera'
import type { CameraActiveRange, CameraSyncMeta } from '../../shared/cameraSync'
import {
  cameraStartLagMs,
  isCameraActiveAtMs,
  resizeCameraActiveRangeEdge,
  screenTimeToCameraTimeSec,
  screenTimelineMsToWallMs,
} from '../../shared/cameraSync'
import type { CaptureGeometry } from '../../shared/cursorCoords'
import {
  isEditableTarget,
  matchShortcut,
  scrubDeltaMs,
} from '../../shared/shortcuts'
import {
  buildTimelineMarkers,
  markerPercent,
} from '../../shared/timelineMarkers'
import {
  discardedKeepWindows,
  normalizeKeepRanges,
  resolveKeepPlaybackMs,
  snapPlayheadIntoKeepRanges,
  type KeepRange,
} from '../../shared/keepRanges'
import { CameraBubble } from './CameraBubble'

export interface AutoZoomPlaybackProps {
  mediaUrl: string
  cursorEvents: CursorEvent[]
  /** Display DIP geometry for Retina/multi-monitor cursor→frame mapping. */
  captureGeometry?: CaptureGeometry | null
  autoZoomEnabled?: boolean
  /** Per-click enable/disable + peak scale (from review editor). */
  zoomPointOverrides?: ZoomPointOverride[]
  /** User-added zooms at playhead (merged with click segments). */
  manualZoomPoints?: ManualZoomPoint[]
  cursorSmoothingEnabled?: boolean
  cursorAppearance?: CursorAppearance
  background?: BackgroundStyle
  /** Recorded camera.webm URL; bubble stays outside zoom (matches export). */
  cameraMediaUrl?: string | null
  cameraOverlay?: CameraOverlayStyle
  /** First-chunk sync meta — offsets review bubble seek to match export. */
  cameraSync?: CameraSyncMeta | null
  /**
   * Review-edited active windows (wall ms). When set, overrides sync meta
   * ranges for bubble visibility + timeline markers (preview ≡ export).
   */
  cameraActiveRangesOverride?: CameraActiveRange[] | null
  /** Persist drag/snap layout from the review bubble (relative 0–1 coords). */
  onCameraLayoutChange?: (next: CameraOverlayStyle) => void
  /**
   * Drag-resize FaceTime active-window edges on the scrubber (wall ms).
   * When set, camera spans show start/end handles.
   */
  onCameraActiveRangesChange?: (ranges: CameraActiveRange[]) => void
  trimStartMs?: number
  trimEndMs?: number
  /**
   * Multi-segment keep windows (FOKUS 5). When 2+ ranges with gaps, playback
   * skips discarded regions so preview matches ffmpeg concat.
   */
  keepRanges?: KeepRange[]
  onDurationMs?: (ms: number) => void
  onTimeMs?: (ms: number) => void
}

export function AutoZoomPlayback({
  mediaUrl,
  cursorEvents,
  captureGeometry = null,
  autoZoomEnabled = true,
  zoomPointOverrides = [],
  manualZoomPoints = [],
  cursorSmoothingEnabled = true,
  cursorAppearance = DEFAULT_CURSOR_APPEARANCE,
  background,
  cameraMediaUrl = null,
  cameraOverlay = DEFAULT_CAMERA_OVERLAY,
  cameraSync = null,
  cameraActiveRangesOverride = null,
  onCameraLayoutChange,
  onCameraActiveRangesChange,
  trimStartMs = 0,
  trimEndMs,
  keepRanges,
  onDurationMs,
  onTimeMs,
}: AutoZoomPlaybackProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const currentMsRef = useRef(0)
  const markersTrackRef = useRef<HTMLDivElement | null>(null)
  const cameraRangeDragRef = useRef<{
    rangeIndex: number
    edge: 'start' | 'end'
    pointerId: number
  } | null>(null)
  const effectiveCameraRangesRef = useRef<CameraActiveRange[] | null | undefined>(
    cameraActiveRangesOverride,
  )
  const keepRangesRef = useRef<KeepRange[] | undefined>(keepRanges)
  const [videoSize, setVideoSize] = useState<VideoSize>({ width: 1920, height: 1080 })
  const [transform, setTransform] = useState({ scale: 1, focusX: 0.5, focusY: 0.5 })
  const [cursorPos, setCursorPos] = useState<NormalizedPoint | null>(null)
  const [clickRings, setClickRings] = useState<ActiveClickRing[]>([])
  const [clickHighlights, setClickHighlights] = useState<ActiveClickHighlight[]>([])
  const [playing, setPlaying] = useState(false)
  const [durationMs, setDurationMs] = useState(0)
  const [currentMs, setCurrentMs] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const effectiveEndMs = trimEndMs ?? durationMs
  const normalizedKeepRanges = useMemo(() => {
    if (!keepRanges || keepRanges.length === 0 || durationMs <= 0) return null
    return normalizeKeepRanges(keepRanges, durationMs)
  }, [durationMs, keepRanges])
  const gapWindows = useMemo(() => {
    if (!normalizedKeepRanges || normalizedKeepRanges.length === 0 || durationMs <= 0) {
      return []
    }
    return discardedKeepWindows(normalizedKeepRanges, durationMs)
  }, [durationMs, normalizedKeepRanges])
  const keepPlayStartMs = normalizedKeepRanges?.[0]?.startMs ?? trimStartMs
  const keepPlayEndMs =
    normalizedKeepRanges?.[normalizedKeepRanges.length - 1]?.endMs ?? effectiveEndMs

  useEffect(() => {
    keepRangesRef.current = keepRanges
  }, [keepRanges])
  const cursorDraw = useMemo(
    () => appearanceToCursorDrawOptions(cursorAppearance),
    [cursorAppearance],
  )
  const showCursor = cursorSmoothingEnabled && cursorDraw.visible

  const baseSegments = useMemo(
    () =>
      autoZoomEnabled
        ? buildZoomSegments(cursorEvents, videoSize, {
            ...(captureGeometry ? { geometry: captureGeometry } : {}),
          })
        : [],
    [autoZoomEnabled, captureGeometry, cursorEvents, videoSize],
  )

  const segments = useMemo(
    () =>
      autoZoomEnabled
        ? mergeZoomSegments(
            applyZoomPointOverrides(baseSegments, zoomPointOverrides),
            manualZoomPoints,
          )
        : [],
    [autoZoomEnabled, baseSegments, manualZoomPoints, zoomPointOverrides],
  )

  const cursorKeyframes = useMemo(
    () => buildCursorKeyframes(cursorEvents),
    [cursorEvents],
  )

  const cursorGeoOpts = useMemo(
    () => (captureGeometry ? { geometry: captureGeometry } : {}),
    [captureGeometry],
  )

  const clickRingTriggers = useMemo(
    () => buildClickRings(cursorEvents, videoSize, cursorGeoOpts),
    [cursorEvents, cursorGeoOpts, videoSize],
  )

  const clickCount = cursorEvents.filter((e) => e.kind === 'click' || e.kind === 'down').length

  const effectiveCameraRanges =
    cameraActiveRangesOverride !== null
      ? cameraActiveRangesOverride
      : cameraSync?.activeRanges

  const cameraWallDurationMs = Math.max(
    cameraSync?.wallDurationMs ?? 0,
    durationMs + Math.max(0, cameraSync?.screenFirstChunkMs ?? 0),
  )

  useEffect(() => {
    effectiveCameraRangesRef.current = effectiveCameraRanges
  }, [effectiveCameraRanges])

  const timelineMarkers = useMemo(
    () =>
      buildTimelineMarkers(segments, cursorEvents, {
        cameraActiveRanges: effectiveCameraRanges,
        screenFirstChunkMs: cameraSync?.screenFirstChunkMs,
        wallDurationMs: cameraWallDurationMs,
      }),
    [
      cameraSync?.screenFirstChunkMs,
      cameraWallDurationMs,
      cursorEvents,
      effectiveCameraRanges,
      segments,
    ],
  )

  const applyCameraRangeEdgeAtClientX = useCallback(
    (clientX: number, rangeIndex: number, edge: 'start' | 'end') => {
      if (!onCameraActiveRangesChange || durationMs <= 0) return
      const track = markersTrackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      if (rect.width <= 0) return
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const screenMs = ratio * durationMs
      const wallMs = screenTimelineMsToWallMs(screenMs, cameraSync?.screenFirstChunkMs)
      const next = resizeCameraActiveRangeEdge(
        effectiveCameraRangesRef.current,
        rangeIndex,
        edge,
        wallMs,
        cameraWallDurationMs,
      )
      onCameraActiveRangesChange(next)
    },
    [
      cameraSync?.screenFirstChunkMs,
      cameraWallDurationMs,
      durationMs,
      onCameraActiveRangesChange,
    ],
  )

  const onCameraRangeEdgePointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLSpanElement>,
      rangeIndex: number,
      edge: 'start' | 'end',
    ) => {
      if (!onCameraActiveRangesChange || Boolean(loadError)) return
      event.preventDefault()
      event.stopPropagation()
      const target = event.currentTarget
      target.setPointerCapture(event.pointerId)
      cameraRangeDragRef.current = {
        rangeIndex,
        edge,
        pointerId: event.pointerId,
      }
      applyCameraRangeEdgeAtClientX(event.clientX, rangeIndex, edge)
    },
    [applyCameraRangeEdgeAtClientX, loadError, onCameraActiveRangesChange],
  )

  const onCameraRangeEdgePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      const drag = cameraRangeDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      applyCameraRangeEdgeAtClientX(event.clientX, drag.rangeIndex, drag.edge)
    },
    [applyCameraRangeEdgeAtClientX],
  )

  const onCameraRangeEdgePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      const drag = cameraRangeDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      cameraRangeDragRef.current = null
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        /* already released */
      }
    },
    [],
  )

  const updateCursorOverlay = useCallback(
    (tMs: number) => {
      if (!showCursor || cursorKeyframes.length === 0) {
        setCursorPos(null)
        setClickRings([])
        setClickHighlights([])
        return
      }
      setCursorPos(getSmoothedCursorAtTime(tMs, cursorKeyframes, videoSize, cursorGeoOpts))
      setClickRings(getActiveClickRings(tMs, clickRingTriggers))
      setClickHighlights(
        cursorDraw.clickHighlightEnabled
          ? getActiveClickHighlights(tMs, clickRingTriggers)
          : [],
      )
    },
    [
      clickRingTriggers,
      cursorDraw.clickHighlightEnabled,
      cursorGeoOpts,
      cursorKeyframes,
      showCursor,
      videoSize,
    ],
  )

  useEffect(() => {
    currentMsRef.current = currentMs
  }, [currentMs])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    setLoadError(null)
    setLoading(true)
    setPlaying(false)
    setTransform({ scale: 1, focusX: 0.5, focusY: 0.5 })
    setCursorPos(null)
    setClickRings([])
    setClickHighlights([])
    el.src = mediaUrl
    void el.load()
  }, [mediaUrl])

  const seekToMs = useCallback(
    (ms: number) => {
      const el = videoRef.current
      if (!el) return
      const ranges = keepRangesRef.current
      let clamped = Math.max(trimStartMs, Math.min(effectiveEndMs, ms))
      if (ranges && ranges.length > 0 && durationMs > 0) {
        clamped = snapPlayheadIntoKeepRanges(ranges, clamped, durationMs)
      }
      el.currentTime = clamped / 1000
      setCurrentMs(clamped)
      onTimeMs?.(clamped)
      updateCursorOverlay(clamped)
    },
    [durationMs, effectiveEndMs, onTimeMs, trimStartMs, updateCursorOverlay],
  )

  function onLoadedMetadata() {
    const el = videoRef.current
    if (!el) return
    const w = el.videoWidth || 1920
    const h = el.videoHeight || 1080
    setVideoSize({ width: w, height: h })
    const durMs = Number.isFinite(el.duration) ? el.duration * 1000 : 0
    setDurationMs(durMs)
    onDurationMs?.(durMs)
    setLoading(false)
    const startMs =
      keepRanges && keepRanges.length > 0 && durMs > 0
        ? snapPlayheadIntoKeepRanges(keepRanges, Math.max(trimStartMs, 0), durMs)
        : trimStartMs
    if (startMs > 0) {
      el.currentTime = startMs / 1000
      setCurrentMs(startMs)
      updateCursorOverlay(startMs)
      onTimeMs?.(startMs)
    }
  }

  function onTimeUpdate() {
    const el = videoRef.current
    if (!el) return
    let tMs = el.currentTime * 1000
    const ranges = keepRangesRef.current

    if (ranges && ranges.length > 0 && durationMs > 0) {
      const resolved = resolveKeepPlaybackMs(ranges, tMs, durationMs)
      if (resolved.shouldPause) {
        el.pause()
        setPlaying(false)
        if (Math.abs(resolved.ms - tMs) > 1) {
          seekToMs(resolved.ms)
        } else {
          setCurrentMs(resolved.ms)
          onTimeMs?.(resolved.ms)
          updateCursorOverlay(resolved.ms)
        }
        return
      }
      if (Math.abs(resolved.ms - tMs) > 1) {
        // Gap-skip: jump to next keep window (preview ≡ export concat).
        el.currentTime = resolved.ms / 1000
        tMs = resolved.ms
        setCurrentMs(tMs)
        onTimeMs?.(tMs)
        updateCursorOverlay(tMs)
        if (autoZoomEnabled) {
          setTransform(getZoomTransformAtTime(tMs, segments))
        }
        return
      }
    } else {
      if (tMs >= effectiveEndMs && effectiveEndMs > 0) {
        el.pause()
        setPlaying(false)
        seekToMs(effectiveEndMs)
        return
      }
      if (tMs < trimStartMs) {
        seekToMs(trimStartMs)
        return
      }
    }

    setCurrentMs(tMs)
    onTimeMs?.(tMs)
    updateCursorOverlay(tMs)
    if (!autoZoomEnabled) return
    const next = getZoomTransformAtTime(tMs, segments)
    setTransform(next)
  }

  const togglePlay = useCallback(() => {
    const el = videoRef.current
    if (!el || loadError) return
    if (el.paused) {
      const endMs = keepPlayEndMs
      const startMs = keepPlayStartMs
      if (currentMsRef.current >= endMs - 50) {
        seekToMs(startMs)
      } else if (keepRangesRef.current && keepRangesRef.current.length > 0 && durationMs > 0) {
        const snapped = snapPlayheadIntoKeepRanges(
          keepRangesRef.current,
          currentMsRef.current,
          durationMs,
        )
        if (Math.abs(snapped - currentMsRef.current) > 1) {
          seekToMs(snapped)
        }
      }
      void el.play().catch(() => {
        setLoadError('Playback blocked — click Play again.')
      })
      setPlaying(true)
    } else {
      el.pause()
      setPlaying(false)
    }
  }, [durationMs, keepPlayEndMs, keepPlayStartMs, loadError, seekToMs])

  function onScrub(value: number) {
    seekToMs(value)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableTarget(event.target)) return
      const action = matchShortcut(event, 'review')
      if (action === 'toggle-play') {
        event.preventDefault()
        togglePlay()
        return
      }
      if (action === 'scrub-back' || action === 'scrub-forward') {
        event.preventDefault()
        const delta = scrubDeltaMs(event.shiftKey)
        const next =
          action === 'scrub-back'
            ? currentMsRef.current - delta
            : currentMsRef.current + delta
        seekToMs(next)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [seekToMs, togglePlay])

  const stageStyle =
    autoZoomEnabled
      ? {
          transformOrigin: `${transform.focusX * 100}% ${transform.focusY * 100}%`,
          transform: `scale(${transform.scale})`,
        }
      : undefined

  const aspectRatio =
    videoSize.width > 0 && videoSize.height > 0
      ? `${videoSize.width} / ${videoSize.height}`
      : '16 / 9'

  const backgroundFrame = useMemo(
    () => (background ? resolveBackgroundFrame(background) : null),
    [background],
  )

  const cursorStyleClass =
    cursorDraw.style === 'crosshair'
      ? 'cursor-overlay__pointer cursor-overlay__pointer--crosshair'
      : 'cursor-overlay__dot'

  const showCamera =
    Boolean(cameraMediaUrl) &&
    cameraOverlay.enabled &&
    isCameraActiveAtMs(
      effectiveCameraRanges,
      screenTimelineMsToWallMs(currentMs, cameraSync?.screenFirstChunkMs),
      cameraSync?.wallDurationMs ?? durationMs,
    )

  const cameraTimeSec = screenTimeToCameraTimeSec(currentMs / 1000, {
    offsetMs: cameraStartLagMs(cameraSync),
    ptsRate: 1,
  })

  const cameraBubble = showCamera ? (
    <CameraBubble
      mediaUrl={cameraMediaUrl}
      currentTimeSec={cameraTimeSec}
      playing={playing}
      style={cameraOverlay}
      label="Camera overlay"
      onLayoutChange={onCameraLayoutChange}
      frameAspect={
        videoSize.width > 0 && videoSize.height > 0
          ? videoSize.width / videoSize.height
          : undefined
      }
    />
  ) : null

  const stage = (
    <div
      className="zoom-playback__stage"
      style={{ aspectRatio, ...stageStyle }}
    >
      <video
        ref={videoRef}
        className="zoom-playback__video"
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setLoading(false)
          setLoadError('Could not play recording. Try recording again or export directly.')
        }}
        onCanPlay={() => setLoading(false)}
      />
      {showCursor && cursorPos ? (
        <div className="cursor-overlay" aria-hidden="true">
          {cursorDraw.spotlightEnabled ? (
            <span
              className="cursor-overlay__spotlight"
              style={{
                left: `${cursorPos.x * 100}%`,
                top: `${cursorPos.y * 100}%`,
                width: `${cursorDraw.spotlightPx}px`,
                height: `${cursorDraw.spotlightPx}px`,
              }}
            />
          ) : null}
          {clickHighlights.map((hl, i) => (
            <span
              key={`hl-${hl.x}-${hl.y}-${i}`}
              className="cursor-overlay__highlight"
              style={{
                left: `${hl.x * 100}%`,
                top: `${hl.y * 100}%`,
                width: `${cursorDraw.highlightPx}px`,
                height: `${cursorDraw.highlightPx}px`,
                transform: `translate(-50%, -50%) scale(${hl.scale})`,
                opacity: hl.opacity,
              }}
            />
          ))}
          {clickRings.map((ring, i) => (
            <span
              key={`${ring.x}-${ring.y}-${i}`}
              className="cursor-overlay__ring"
              style={{
                left: `${ring.x * 100}%`,
                top: `${ring.y * 100}%`,
                width: `${Math.round((36 * cursorDraw.ringBasePx) / 44)}px`,
                height: `${Math.round((36 * cursorDraw.ringBasePx) / 44)}px`,
                transform: `translate(-50%, -50%) scale(${ring.scale})`,
                opacity: ring.opacity,
              }}
            />
          ))}
          <span
            className={cursorStyleClass}
            style={{
              left: `${cursorPos.x * 100}%`,
              top: `${cursorPos.y * 100}%`,
              width: `${cursorDraw.dotSizePx}px`,
              height: `${cursorDraw.dotSizePx}px`,
            }}
          />
        </div>
      ) : null}
    </div>
  )

  return (
    <div className="zoom-playback">
      <div className="zoom-playback__viewport">
        {loading ? (
          <p className="zoom-playback__status">Loading preview…</p>
        ) : null}
        {loadError ? (
          <p className="zoom-playback__status zoom-playback__status--error" role="alert">
            {loadError}
          </p>
        ) : null}
        {backgroundFrame ? (
          <div
            className="zoom-playback__background"
            style={{ background: backgroundFrame.backgroundCss }}
          >
            <div
              className="zoom-playback__frame"
              style={{
                padding: `${backgroundFrame.paddingPercent}%`,
              }}
            >
              <div
                className="zoom-playback__card"
                style={{
                  borderRadius: `${backgroundFrame.cornerRadiusPx}px`,
                  boxShadow: backgroundFrame.boxShadow,
                }}
              >
                {stage}
              </div>
            </div>
            {/* Camera on full canvas (after zoom+bg) — matches ffmpeg order. */}
            {cameraBubble}
          </div>
        ) : (
          <div className="zoom-playback__composite" style={{ aspectRatio }}>
            {stage}
            {cameraBubble}
          </div>
        )}
      </div>

      <div className="zoom-playback__controls">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={Boolean(loadError)}
          onClick={togglePlay}
          title="Space"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <span className="zoom-playback__time">
          {formatTimeMs(currentMs)} / {formatTimeMs(durationMs)}
        </span>
        <div className="zoom-playback__timeline">
          <div
            ref={markersTrackRef}
            className="zoom-playback__markers"
            role="list"
            aria-label="Clip markers"
          >
            {durationMs > 0
              ? timelineMarkers.map((marker) => {
                  if (
                    (marker.kind === 'zoom' || marker.kind === 'camera') &&
                    marker.startMs != null &&
                    marker.endMs != null
                  ) {
                    const spanLeft = markerPercent(marker.startMs, durationMs)
                    const spanWidth = Math.max(
                      0.4,
                      markerPercent(marker.endMs, durationMs) - spanLeft,
                    )
                    const kindClass =
                      marker.kind === 'camera'
                        ? 'zoom-playback__marker--camera'
                        : 'zoom-playback__marker--zoom'
                    const canResizeCamera =
                      marker.kind === 'camera' &&
                      marker.rangeIndex != null &&
                      Boolean(onCameraActiveRangesChange) &&
                      !loadError
                    if (canResizeCamera) {
                      return (
                        <div
                          key={marker.id}
                          role="listitem"
                          className="zoom-playback__marker zoom-playback__marker--camera zoom-playback__marker--camera-editable"
                          style={{ left: `${spanLeft}%`, width: `${spanWidth}%` }}
                          title={`${marker.label} · drag edges to trim · ${formatTimeMs(marker.tMs)}`}
                        >
                          <button
                            type="button"
                            className="zoom-playback__marker-body"
                            aria-label={`${marker.label} at ${formatTimeMs(marker.tMs)}`}
                            onClick={() => onScrub(marker.tMs)}
                          />
                          <span
                            className="zoom-playback__marker-handle zoom-playback__marker-handle--start"
                            role="slider"
                            aria-label={`${marker.label} start`}
                            aria-valuemin={0}
                            aria-valuemax={durationMs}
                            aria-valuenow={marker.startMs}
                            tabIndex={-1}
                            onPointerDown={(e) =>
                              onCameraRangeEdgePointerDown(e, marker.rangeIndex!, 'start')
                            }
                            onPointerMove={onCameraRangeEdgePointerMove}
                            onPointerUp={onCameraRangeEdgePointerUp}
                            onPointerCancel={onCameraRangeEdgePointerUp}
                          />
                          <span
                            className="zoom-playback__marker-handle zoom-playback__marker-handle--end"
                            role="slider"
                            aria-label={`${marker.label} end`}
                            aria-valuemin={0}
                            aria-valuemax={durationMs}
                            aria-valuenow={marker.endMs}
                            tabIndex={-1}
                            onPointerDown={(e) =>
                              onCameraRangeEdgePointerDown(e, marker.rangeIndex!, 'end')
                            }
                            onPointerMove={onCameraRangeEdgePointerMove}
                            onPointerUp={onCameraRangeEdgePointerUp}
                            onPointerCancel={onCameraRangeEdgePointerUp}
                          />
                        </div>
                      )
                    }
                    return (
                      <button
                        key={marker.id}
                        type="button"
                        role="listitem"
                        className={`zoom-playback__marker ${kindClass}`}
                        style={{ left: `${spanLeft}%`, width: `${spanWidth}%` }}
                        title={`${marker.label} · ${formatTimeMs(marker.tMs)}`}
                        aria-label={`${marker.label} at ${formatTimeMs(marker.tMs)}`}
                        disabled={Boolean(loadError)}
                        onClick={() => onScrub(marker.tMs)}
                      />
                    )
                  }
                  return (
                    <button
                      key={marker.id}
                      type="button"
                      role="listitem"
                      className="zoom-playback__marker zoom-playback__marker--click"
                      style={{ left: `${markerPercent(marker.tMs, durationMs)}%` }}
                      title={`${marker.label} · ${formatTimeMs(marker.tMs)}`}
                      aria-label={`${marker.label} at ${formatTimeMs(marker.tMs)}`}
                      disabled={Boolean(loadError)}
                      onClick={() => onScrub(marker.tMs)}
                    />
                  )
                })
              : null}
            {durationMs > 0 && gapWindows.length > 0
              ? gapWindows.map((gap) => {
                  const left = markerPercent(gap.startMs, durationMs)
                  const width = Math.max(
                    0.2,
                    markerPercent(gap.endMs, durationMs) - left,
                  )
                  return (
                    <span
                      key={`gap-${gap.startMs}-${gap.endMs}`}
                      className="zoom-playback__trim-shade zoom-playback__trim-shade--gap"
                      style={{ left: `${left}%`, width: `${width}%` }}
                      aria-hidden="true"
                      title="Skipped on export"
                    />
                  )
                })
              : durationMs > 0 && (trimStartMs > 0 || effectiveEndMs < durationMs) ? (
              <>
                <span
                  className="zoom-playback__trim-shade zoom-playback__trim-shade--start"
                  style={{ width: `${markerPercent(trimStartMs, durationMs)}%` }}
                  aria-hidden="true"
                />
                <span
                  className="zoom-playback__trim-shade zoom-playback__trim-shade--end"
                  style={{
                    left: `${markerPercent(effectiveEndMs, durationMs)}%`,
                    width: `${100 - markerPercent(effectiveEndMs, durationMs)}%`,
                  }}
                  aria-hidden="true"
                />
              </>
            ) : null}
          </div>
          <input
            type="range"
            className="zoom-playback__scrub"
            min={trimStartMs}
            max={Math.max(trimStartMs + 1, effectiveEndMs)}
            value={Math.min(currentMs, effectiveEndMs)}
            disabled={Boolean(loadError) || durationMs <= 0}
            onChange={(e) => onScrub(Number(e.target.value))}
            aria-label="Playback position"
          />
        </div>
        <span className="zoom-playback__meta">
          {autoZoomEnabled
            ? `${segments.length} zoom · ${clickCount} click${clickCount === 1 ? '' : 's'}`
            : 'Auto-zoom off'}
          {showCursor
            ? ` · cursor ${cursorDraw.style}`
            : cursorSmoothingEnabled
              ? ' · cursor hidden'
              : ''}
          {backgroundFrame ? ' · background on' : ''}
          {showCamera ? ' · camera on' : ''}
        </span>
      </div>
    </div>
  )
}
