import {
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  CAMERA_DEFAULT_ASPECT,
  cameraBubblePosition,
  cameraSnapPresetLabel,
  matchCameraSnapTarget,
  placeCameraAtPoint,
  type CameraOverlayStyle,
} from '../../shared/camera'

export interface CameraLayoutMapProps {
  style: CameraOverlayStyle
  /** When set, clicks/keyboard place the bubble (preview ≡ export coords). */
  onLayoutChange?: (next: CameraOverlayStyle) => void
  disabled?: boolean
  /** Frame aspect for the schematic (default 16:9). */
  frameAspect?: number
  className?: string
}

/**
 * Compact chrome schematic of FaceTime bubble placement.
 * Lives outside the capture preview so mid-recording layout edits stay visible
 * without burning the live camera into screen WebM.
 */
export function CameraLayoutMap({
  style,
  onLayoutChange,
  disabled = false,
  frameAspect = CAMERA_DEFAULT_ASPECT,
  className = '',
}: CameraLayoutMapProps) {
  const interactive = Boolean(onLayoutChange) && !disabled
  const pos = cameraBubblePosition(style, frameAspect)
  const snap = matchCameraSnapTarget(style, frameAspect)
  const label = snap ? cameraSnapPresetLabel(snap) : 'Custom'

  const placeFromClient = useCallback(
    (clientX: number, clientY: number, target: HTMLElement) => {
      if (!onLayoutChange || disabled) return
      const rect = target.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const pointerX = (clientX - rect.left) / rect.width
      const pointerY = (clientY - rect.top) / rect.height
      onLayoutChange(placeCameraAtPoint(style, pointerX, pointerY, frameAspect))
    },
    [disabled, frameAspect, onLayoutChange, style],
  )

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive) return
    e.preventDefault()
    placeFromClient(e.clientX, e.clientY, e.currentTarget)
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!interactive) return
    // Nudge via existing arrow handling lives on the live bubble; map uses
    // number-pad-style corners: 7/9/1/3 ≈ TL/TR/BL/BR for quick place.
    const map: Record<string, { x: number; y: number }> = {
      '7': { x: 0.08, y: 0.08 },
      '9': { x: 0.92, y: 0.08 },
      '1': { x: 0.08, y: 0.92 },
      '3': { x: 0.92, y: 0.92 },
      '5': { x: 0.5, y: 0.5 },
    }
    const hit = map[e.key]
    if (!hit) return
    e.preventDefault()
    e.stopPropagation()
    onLayoutChange?.(placeCameraAtPoint(style, hit.x, hit.y, frameAspect))
  }

  return (
    <div
      className={`camera-layout-map${interactive ? ' camera-layout-map--interactive' : ''}${
        className ? ` ${className}` : ''
      }`}
      aria-label={`Export camera layout · ${label}`}
    >
      <div
        className="camera-layout-map__frame"
        style={{ aspectRatio: `${frameAspect}` }}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        title={
          interactive
            ? 'Click to place FaceTime bubble (snaps to corners/edges)'
            : undefined
        }
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      >
        <div
          className="camera-layout-map__bubble"
          style={{
            top: pos.top,
            left: pos.left,
            width: pos.width,
            height: pos.height,
            aspectRatio: pos.aspectRatio,
            borderRadius: pos.borderRadius,
            opacity: Math.max(0.55, pos.opacity),
          }}
          aria-hidden
        />
      </div>
      <span className="camera-layout-map__label" role="status">
        Layout · {label}
      </span>
    </div>
  )
}
