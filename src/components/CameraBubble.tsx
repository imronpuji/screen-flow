import { useEffect, useRef } from 'react'
import {
  cameraBubblePosition,
  type CameraOverlayStyle,
} from '../../shared/camera'

export interface CameraBubbleProps {
  stream: MediaStream | null
  style: CameraOverlayStyle
  /** Extra class on the root bubble (e.g. muted preview chrome). */
  className?: string
  label?: string
}

/** Live FaceTime/webcam bubble over a positioned preview frame. */
export function CameraBubble({
  stream,
  style,
  className = '',
  label = 'Camera',
}: CameraBubbleProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const pos = cameraBubblePosition(style)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = stream
    if (stream) {
      void el.play().catch(() => {
        /* autoplay can fail if backgrounded */
      })
    }
  }, [stream])

  if (!style.enabled || !stream) return null

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
        className="camera-bubble__video"
        muted
        playsInline
        autoPlay
      />
    </div>
  )
}
