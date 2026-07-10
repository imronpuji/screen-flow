import { useEffect, useRef } from 'react'
import type { CameraShape } from '../../shared/camera'

export interface CameraMonitorProps {
  stream: MediaStream
  /** When false, video is dimmed (tracks may be muted mid-recording). */
  live: boolean
  mirrored?: boolean
  shape?: CameraShape
  className?: string
}

/**
 * Docked FaceTime self-view for the app chrome while recording.
 * Does NOT force MediaStreamTrack.enabled — mid-recording mute must stay authoritative.
 * Kept out of the capture preview frame so layout-positioned bubble is not burned into screen WebM.
 */
export function CameraMonitor({
  stream,
  live,
  mirrored = true,
  shape = 'circle',
  className = '',
}: CameraMonitorProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = stream
    void el.play().catch(() => {
      /* autoplay can fail if backgrounded */
    })
    return () => {
      el.srcObject = null
    }
  }, [stream])

  const shapeClass =
    shape === 'rectangle'
      ? 'camera-monitor__frame--rect'
      : shape === 'rounded'
        ? 'camera-monitor__frame--rounded'
        : 'camera-monitor__frame--circle'

  return (
    <div
      className={`camera-monitor${live ? '' : ' camera-monitor--muted'}${
        className ? ` ${className}` : ''
      }`}
      aria-label={live ? 'FaceTime monitor live' : 'FaceTime monitor muted'}
    >
      <div className={`camera-monitor__frame ${shapeClass}`}>
        <video
          ref={videoRef}
          className={
            mirrored
              ? 'camera-monitor__video'
              : 'camera-monitor__video camera-monitor__video--natural'
          }
          muted
          playsInline
          autoPlay
        />
      </div>
      <span className="camera-monitor__status" role="status">
        {live ? 'Live' : 'Muted'}
      </span>
    </div>
  )
}
