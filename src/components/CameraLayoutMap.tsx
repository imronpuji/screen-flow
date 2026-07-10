import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import {
  CAMERA_DEFAULT_ASPECT,
  cameraBubbleChromeStyle,
  cameraBubblePosition,
  cameraSnapPresetLabel,
  matchCameraSnapTarget,
  nudgeCameraSize,
  placeCameraAtPoint,
  type CameraOverlayStyle,
} from '../../shared/camera'

export interface CameraLayoutMapProps {
  style: CameraOverlayStyle
  /** When set, clicks/drag/wheel place or resize the bubble (preview ≡ export coords). */
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
 *
 * Interaction (FOKUS 3B):
 * - Click or drag to place (magnetic snap, same as live bubble)
 * - Scroll wheel to resize (Shift = larger steps) via nudgeCameraSize
 * - Numpad-style 7/9/1/3/5 for quick corners + center
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
  const chrome = cameraBubbleChromeStyle(style)
  const snap = matchCameraSnapTarget(style, frameAspect)
  const label = snap ? cameraSnapPresetLabel(snap) : 'Custom'
  const draggingRef = useRef(false)
  const [dragging, setDragging] = useState(false)
  /** Latest style for pointermove — avoids stale closure mid-drag. */
  const styleRef = useRef(style)
  useEffect(() => {
    styleRef.current = style
  }, [style])

  const placeFromClient = useCallback(
    (clientX: number, clientY: number, target: HTMLElement) => {
      if (!onLayoutChange || disabled) return
      const rect = target.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const pointerX = (clientX - rect.left) / rect.width
      const pointerY = (clientY - rect.top) / rect.height
      onLayoutChange(
        placeCameraAtPoint(styleRef.current, pointerX, pointerY, frameAspect),
      )
    },
    [disabled, frameAspect, onLayoutChange],
  )

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive) return
    e.preventDefault()
    draggingRef.current = true
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    placeFromClient(e.clientX, e.clientY, e.currentTarget)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive || !draggingRef.current) return
    placeFromClient(e.clientX, e.clientY, e.currentTarget)
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
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

  function onWheel(e: ReactWheelEvent<HTMLDivElement>) {
    if (!interactive || !onLayoutChange) return
    // Prefer vertical scroll; ignore tiny trackpad noise.
    if (Math.abs(e.deltaY) < 0.5) return
    e.preventDefault()
    e.stopPropagation()
    const direction = e.deltaY < 0 ? 'grow' : 'shrink'
    onLayoutChange(
      nudgeCameraSize(styleRef.current, direction, {
        shift: e.shiftKey,
        frameAspect,
      }),
    )
  }

  return (
    <div
      className={`camera-layout-map${interactive ? ' camera-layout-map--interactive' : ''}${
        dragging ? ' camera-layout-map--dragging' : ''
      }${className ? ` ${className}` : ''}`}
      aria-label={`Export camera layout · ${label}`}
    >
      <div
        className="camera-layout-map__frame"
        style={{ aspectRatio: `${frameAspect}` }}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        title={
          interactive
            ? 'Drag to place FaceTime bubble · scroll to resize (Shift = larger steps)'
            : undefined
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onWheel={onWheel}
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
            border: style.borderEnabled ? chrome.border : '1.5px solid color-mix(in srgb, var(--accent) 75%, #e8eef4)',
            boxShadow: style.shadowEnabled
              ? chrome.boxShadow
              : '0 4px 12px rgba(0, 0, 0, 0.35)',
          }}
          aria-hidden
        />
      </div>
      <span className="camera-layout-map__label" role="status">
        Layout · {label}
        {interactive ? ' · drag / scroll' : ''}
      </span>
    </div>
  )
}
