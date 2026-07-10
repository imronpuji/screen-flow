import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CursorEvent } from '../../shared/cursor'
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

export interface AutoZoomPlaybackProps {
  mediaUrl: string
  cursorEvents: CursorEvent[]
  autoZoomEnabled?: boolean
  cursorSmoothingEnabled?: boolean
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
      if (!cursorSmoothingEnabled || cursorKeyframes.length === 0) {
        setCursorPos(null)
        setClickRings([])
        return
      }
      setCursorPos(getSmoothedCursorAtTime(tMs, cursorKeyframes, videoSize))
      setClickRings(getActiveClickRings(tMs, clickRingTriggers))
    },
    [clickRingTriggers, cursorKeyframes, cursorSmoothingEnabled, videoSize],
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
          {cursorSmoothingEnabled && cursorPos ? (
            <div className="cursor-overlay" aria-hidden="true">
              {clickRings.map((ring, i) => (
                <span
                  key={`${ring.x}-${ring.y}-${i}`}
                  className="cursor-overlay__ring"
                  style={{
                    left: `${ring.x * 100}%`,
                    top: `${ring.y * 100}%`,
                    transform: `translate(-50%, -50%) scale(${ring.scale})`,
                    opacity: ring.opacity,
                  }}
                />
              ))}
              <span
                className="cursor-overlay__dot"
                style={{
                  left: `${cursorPos.x * 100}%`,
                  top: `${cursorPos.y * 100}%`,
                }}
              />
            </div>
          ) : null}
        </div>
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
          {cursorSmoothingEnabled ? ' · cursor on' : ''}
        </span>
      </div>
    </div>
  )
}
