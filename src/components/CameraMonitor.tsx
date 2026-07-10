import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { CameraShape } from '../../shared/camera'

export interface CameraMonitorProps {
  stream: MediaStream
  /** When false, video is dimmed (tracks may be muted mid-recording). */
  live: boolean
  mirrored?: boolean
  shape?: CameraShape
  className?: string
  /**
   * Click / Enter / Space toggles mid-recording mute. Parent owns track.enabled
   * + activeRanges — this component never forces tracks on.
   */
  onToggleLive?: () => void
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
  onToggleLive,
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

  const interactive = Boolean(onToggleLive)

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!onToggleLive) return
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onToggleLive()
  }

  return (
    <div
      className={`camera-monitor${live ? '' : ' camera-monitor--muted'}${
        interactive ? ' camera-monitor--interactive' : ''
      }${className ? ` ${className}` : ''}`}
      aria-label={
        live
          ? interactive
            ? 'FaceTime monitor live — click to mute'
            : 'FaceTime monitor live'
          : interactive
            ? 'FaceTime monitor muted — click to unmute'
            : 'FaceTime monitor muted'
      }
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={
        interactive
          ? live
            ? 'Click to mute FaceTime'
            : 'Click to unmute FaceTime'
          : undefined
      }
      onClick={onToggleLive}
      onKeyDown={onKeyDown}
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
        {interactive ? (
          <span className="camera-monitor__hint"> · click to {live ? 'mute' : 'unmute'}</span>
        ) : null}
      </span>
    </div>
  )
}
