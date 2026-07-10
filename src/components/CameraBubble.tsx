import { useEffect, useRef } from 'react'
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
  mirrored = true,
  style,
  className = '',
  label = 'Camera',
}: CameraBubbleProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const pos = cameraBubblePosition(style)
  const useRecorded = Boolean(mediaUrl)
  const active = style.enabled && (useRecorded || Boolean(stream))

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    if (useRecorded && mediaUrl) {
      el.srcObject = null
      if (el.getAttribute('src') !== mediaUrl) {
        el.src = mediaUrl
        void el.load()
      }
      return
    }

    el.removeAttribute('src')
    el.srcObject = stream
    if (stream) {
      void el.play().catch(() => {
        /* autoplay can fail if backgrounded */
      })
    }
  }, [mediaUrl, stream, useRecorded])

  useEffect(() => {
    if (!useRecorded || currentTimeSec == null) return
    const el = videoRef.current
    if (!el || !Number.isFinite(currentTimeSec)) return
    const drift = Math.abs(el.currentTime - currentTimeSec)
    if (drift > SYNC_EPSILON_SEC) {
      el.currentTime = Math.max(0, currentTimeSec)
    }
  }, [currentTimeSec, useRecorded])

  if (!active) return null

  return (
    <div
      className={`camera-bubble ${className}`.trim()}
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
    </div>
  )
}
