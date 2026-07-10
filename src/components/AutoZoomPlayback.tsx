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
import { CameraBubble } from './CameraBubble'

export interface AutoZoomPlaybackProps {
  mediaUrl: string
  cursorEvents: CursorEvent[]
  autoZoomEnabled?: boolean
  cursorSmoothingEnabled?: boolean
  cursorAppearance?: CursorAppearance
  background?: BackgroundStyle
  /** Recorded camera.webm URL; bubble stays outside zoom (matches export). */
  cameraMediaUrl?: string | null
  cameraOverlay?: CameraOverlayStyle
  trimStartMs?: number
  trimEndMs?: number
  onDurationMs?: (ms: number) => void
  onTimeMs?: (ms: number) => void
}

export function AutoZoomPlayback({
  mediaUrl,
  cursorEvents,
  autoZoomEnabled = true,
  cursorSmoothingEnabled = true,
  cursorAppearance = DEFAULT_CURSOR_APPEARANCE,
  background,
  cameraMediaUrl = null,
  cameraOverlay = DEFAULT_CAMERA_OVERLAY,
  trimStartMs = 0,
  trimEndMs,
  onDurationMs,
  onTimeMs,
}: AutoZoomPlaybackProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
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

  const segments = useMemo(
    () => (autoZoomEnabled ? buildZoomSegments(cursorEvents, videoSize) : []),
    [autoZoomEnabled, cursorEvents, videoSize],
  )

  const cursorKeyframes = useMemo(
    () => buildCursorKeyframes(cursorEvents),
    [cursorEvents],
  )

  const clickRingTriggers = useMemo(
    () => buildClickRings(cursorEvents, videoSize),
    [cursorEvents, videoSize],
  )

  const clickCount = cursorEvents.filter((e) => e.kind === 'click' || e.kind === 'down').length

  const updateCursorOverlay = useCallback(
    (tMs: number) => {
      if (!showCursor || cursorKeyframes.length === 0) {
        setCursorPos(null)
        setClickRings([])
        return
      }
      setCursorPos(getSmoothedCursorAtTime(tMs, cursorKeyframes, videoSize))
      setClickRings(getActiveClickRings(tMs, clickRingTriggers))
    },
    [clickRingTriggers, cursorKeyframes, showCursor, videoSize],
  )

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

  function togglePlay() {
    const el = videoRef.current
    if (!el || loadError) return
    if (el.paused) {
      if (currentMs >= effectiveEndMs - 50) {
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
  }

  function onScrub(value: number) {
    seekToMs(value)
  }

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
    Boolean(cameraMediaUrl) && cameraOverlay.enabled

  const cameraBubble = showCamera ? (
    <CameraBubble
      mediaUrl={cameraMediaUrl}
      currentTimeSec={currentMs / 1000}
      mirrored={false}
      style={cameraOverlay}
      label="Camera overlay"
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
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <span className="zoom-playback__time">
          {formatTimeMs(currentMs)} / {formatTimeMs(durationMs)}
        </span>
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
