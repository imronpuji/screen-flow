import { useEffect, useRef, useState } from 'react'
import {
  cameraBubblePosition,
  type CameraOverlayStyle,
} from '../../shared/camera'

export interface CameraBubbleProps {
  /** Live webcam stream (setup / recording). */
  stream?: MediaStream | null
  /** Recorded camera.webm URL for review playback. */
  mediaUrl?: string | null
  /** Keep recorded bubble in sync with screen timeline (seconds). */
  currentTimeSec?: number
  /** When true, play recorded camera in lockstep with the screen preview. */
  playing?: boolean
  /** Mirror for live selfie preview; leave false for recorded/export match. */
  mirrored?: boolean
  style: CameraOverlayStyle
  /** Extra class on the root bubble (e.g. muted preview chrome). */
  className?: string
  label?: string
}

const SYNC_EPSILON_SEC = 0.08

/** FaceTime/webcam bubble over a positioned preview frame (live or recorded). */
export function CameraBubble({
  stream = null,
  mediaUrl = null,
  currentTimeSec,
  playing = false,
  mirrored = true,
  style,
  className = '',
  label = 'Camera',
}: CameraBubbleProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [readySourceKey, setReadySourceKey] = useState<string | null>(null)
  const pos = cameraBubblePosition(style)
  const useRecorded = Boolean(mediaUrl)
  const active = style.enabled && (useRecorded || Boolean(stream))
  const sourceKey = useRecorded ? `rec:${mediaUrl ?? ''}` : `live:${stream?.id ?? ''}`
  const hasFrames = readySourceKey === sourceKey

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    const markReady = () => {
      if (el.videoWidth > 0 || el.readyState >= 2) {
        setReadySourceKey(sourceKey)
      }
    }

    el.addEventListener('loadeddata', markReady)
    el.addEventListener('playing', markReady)
    el.addEventListener('resize', markReady)

    if (useRecorded && mediaUrl) {
      el.srcObject = null
      if (el.getAttribute('src') !== mediaUrl) {
        el.src = mediaUrl
        void el.load()
      }
      return () => {
        el.removeEventListener('loadeddata', markReady)
        el.removeEventListener('playing', markReady)
        el.removeEventListener('resize', markReady)
      }
    }

    el.removeAttribute('src')
    el.srcObject = stream
    if (stream) {
      // Ensure tracks are live — muted/ended tracks render a black bubble.
      for (const track of stream.getVideoTracks()) {
        if (track.readyState === 'live') {
          track.enabled = true
        }
      }
      const tryPlay = () => {
        void el.play().then(markReady).catch(() => {
          /* autoplay can fail if backgrounded */
        })
      }
      tryPlay()
      // Chromium sometimes needs a second kick after the first frame arrives.
      const onMeta = () => tryPlay()
      el.addEventListener('loadedmetadata', onMeta)
      return () => {
        el.removeEventListener('loadedmetadata', onMeta)
        el.removeEventListener('loadeddata', markReady)
        el.removeEventListener('playing', markReady)
        el.removeEventListener('resize', markReady)
      }
    }

    return () => {
      el.removeEventListener('loadeddata', markReady)
      el.removeEventListener('playing', markReady)
      el.removeEventListener('resize', markReady)
    }
  }, [mediaUrl, sourceKey, stream, useRecorded])

  // Recorded path: play/pause with the screen timeline (MediaRecorder WebM seeks poorly).
  useEffect(() => {
    if (!useRecorded) return
    const el = videoRef.current
    if (!el) return
    if (playing) {
      void el.play().catch(() => undefined)
    } else {
      el.pause()
    }
  }, [playing, useRecorded, mediaUrl])

  useEffect(() => {
    if (!useRecorded || currentTimeSec == null) return
    const el = videoRef.current
    if (!el || !Number.isFinite(currentTimeSec)) return
    const target = Math.max(0, currentTimeSec)
    const drift = Math.abs(el.currentTime - target)
    if (drift > SYNC_EPSILON_SEC) {
      try {
        el.currentTime = target
      } catch {
        /* some WebM clusters reject seeks until more data is buffered */
      }
    }
  }, [currentTimeSec, useRecorded])

  if (!active) return null

  return (
    <div
      className={`camera-bubble ${useRecorded ? 'camera-bubble--fixed' : ''} ${className}`.trim()}
      style={{
        top: pos.top,
        bottom: pos.bottom,
        left: pos.left,
        right: pos.right,
        width: pos.width,
        borderRadius: pos.borderRadius,
      }}
      aria-label={label}
    >
      <video
        ref={videoRef}
        className={
          mirrored
            ? 'camera-bubble__video'
            : 'camera-bubble__video camera-bubble__video--natural'
        }
        muted
        playsInline
        autoPlay={!useRecorded}
        preload={useRecorded ? 'auto' : undefined}
      />
      {!hasFrames ? (
        <span className="camera-bubble__waiting" aria-hidden="true">
          Waiting for camera…
        </span>
      ) : null}
    </div>
  )
}
