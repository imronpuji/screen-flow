import { useEffect, useMemo, useRef, useState } from 'react'
import type { CursorEvent } from '../../shared/cursor'
import {
  buildZoomSegments,
  getZoomTransformAtTime,
  type VideoSize,
} from '../../shared/autozoom'

export interface AutoZoomPlaybackProps {
  mediaUrl: string
  cursorEvents: CursorEvent[]
  /** When false, playback is plain video without zoom. */
  autoZoomEnabled?: boolean
}

export function AutoZoomPlayback({
  mediaUrl,
  cursorEvents,
  autoZoomEnabled = true,
}: AutoZoomPlaybackProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [videoSize, setVideoSize] = useState<VideoSize>({ width: 1920, height: 1080 })
  const [transform, setTransform] = useState({ scale: 1, focusX: 0.5, focusY: 0.5 })
  const [playing, setPlaying] = useState(false)

  const segments = useMemo(
    () => (autoZoomEnabled ? buildZoomSegments(cursorEvents, videoSize) : []),
    [autoZoomEnabled, cursorEvents, videoSize],
  )

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.src = mediaUrl
    setPlaying(false)
    setTransform({ scale: 1, focusX: 0.5, focusY: 0.5 })
  }, [mediaUrl])

  function onLoadedMetadata() {
    const el = videoRef.current
    if (!el) return
    const w = el.videoWidth || 1920
    const h = el.videoHeight || 1080
    setVideoSize({ width: w, height: h })
  }

  function onTimeUpdate() {
    const el = videoRef.current
    if (!el || !autoZoomEnabled) return
    const tMs = el.currentTime * 1000
    const next = getZoomTransformAtTime(tMs, segments)
    setTransform(next)
  }

  function togglePlay() {
    const el = videoRef.current
    if (!el) return
    if (el.paused) {
      void el.play()
      setPlaying(true)
    } else {
      el.pause()
      setPlaying(false)
    }
  }

  const clickCount = cursorEvents.filter((e) => e.kind === 'click' || e.kind === 'down').length

  return (
    <div className="zoom-playback">
      <div className="zoom-playback__toolbar">
        <button type="button" className="btn btn--ghost btn--sm" onClick={togglePlay}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <span className="zoom-playback__meta">
          Auto-zoom preview · {segments.length} zoom cue{segments.length === 1 ? '' : 's'} from{' '}
          {clickCount} click{clickCount === 1 ? '' : 's'}
        </span>
      </div>
      <div className="zoom-playback__viewport">
        <video
          ref={videoRef}
          className="zoom-playback__video"
          style={{
            transformOrigin: `${transform.focusX * 100}% ${transform.focusY * 100}%`,
            transform: `scale(${transform.scale})`,
          }}
          muted
          playsInline
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      </div>
    </div>
  )
}
