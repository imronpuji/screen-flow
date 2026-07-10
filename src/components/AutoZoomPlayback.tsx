import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  getActiveClickRings,
  getSmoothedCursorAtTime,
  type ActiveClickRing,
  type NormalizedPoint,
} from '../../shared/cursorSmoothing'
import { formatTimeMs } from '../../shared/edit'
import { resolveBackgroundFrame, type BackgroundStyle } from '../../shared/background'
import {
  DEFAULT_CAMERA_OVERLAY,
  type CameraOverlayStyle,
} from '../../shared/camera'
import type { CameraSyncMeta } from '../../shared/cameraSync'
import {
  cameraStartLagMs,
  isCameraActiveAtMs,
  screenTimeToCameraTimeSec,
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
  /** Persist drag/snap layout from the review bubble (relative 0–1 coords). */
  onCameraLayoutChange?: (next: CameraOverlayStyle) => void
  trimStartMs?: number
  trimEndMs?: number
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
  onCameraLayoutChange,
  trimStartMs = 0,
  trimEndMs,
  onDurationMs,
  onTimeMs,
}: AutoZoomPlaybackProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const currentMsRef = useRef(0)
  const [videoSize, setVideoSize] = useState<VideoSize>({ width: 1920, height: 1080 })
  const [transform, setTransform] = useState({ scale: 1, focusX: 0.5, focusY: 0.5 })
  const [cursorPos, setCursorPos] = useState<NormalizedPoint | null>(null)
  const [clickRings, setClickRings] = useState<ActiveClickRing[]>([])
  const [playing, setPlaying] = useState(false)
  const [durationMs, setDurationMs] = useState(0)
  const [currentMs, setCurrentMs] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const effectiveEndMs = trimEndMs ?? durationMs
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

  const timelineMarkers = useMemo(
    () =>
      buildTimelineMarkers(segments, cursorEvents, {
        cameraActiveRanges: cameraSync?.activeRanges,
        screenFirstChunkMs: cameraSync?.screenFirstChunkMs,
        wallDurationMs: cameraSync?.wallDurationMs ?? durationMs,
      }),
    [
      cameraSync?.activeRanges,
      cameraSync?.screenFirstChunkMs,
      cameraSync?.wallDurationMs,
      cursorEvents,
      durationMs,
      segments,
    ],
  )

  const updateCursorOverlay = useCallback(
    (tMs: number) => {
      if (!showCursor || cursorKeyframes.length === 0) {
        setCursorPos(null)
        setClickRings([])
        return
      }
      setCursorPos(getSmoothedCursorAtTime(tMs, cursorKeyframes, videoSize, cursorGeoOpts))
      setClickRings(getActiveClickRings(tMs, clickRingTriggers))
    },
    [clickRingTriggers, cursorGeoOpts, cursorKeyframes, showCursor, videoSize],
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
    el.src = mediaUrl
    void el.load()
  }, [mediaUrl])

  const seekToMs = useCallback(
    (ms: number) => {
      const el = videoRef.current
      if (!el) return
      const clamped = Math.max(trimStartMs, Math.min(effectiveEndMs, ms))
      el.currentTime = clamped / 1000
      setCurrentMs(clamped)
      onTimeMs?.(clamped)
      updateCursorOverlay(clamped)
    },
    [effectiveEndMs, onTimeMs, trimStartMs, updateCursorOverlay],
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
    if (trimStartMs > 0) {
      el.currentTime = trimStartMs / 1000
      setCurrentMs(trimStartMs)
      updateCursorOverlay(trimStartMs)
    }
  }

  function onTimeUpdate() {
    const el = videoRef.current
    if (!el) return
    const tMs = el.currentTime * 1000
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
      if (currentMsRef.current >= effectiveEndMs - 50) {
        seekToMs(trimStartMs)
      }
      void el.play().catch(() => {
        setLoadError('Playback blocked — click Play again.')
      })
      setPlaying(true)
    } else {
      el.pause()
      setPlaying(false)
    }
  }, [effectiveEndMs, loadError, seekToMs, trimStartMs])

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
      cameraSync?.activeRanges,
      currentMs,
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
            {durationMs > 0 && (trimStartMs > 0 || effectiveEndMs < durationMs) ? (
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
