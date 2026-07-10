import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import {
  CAMERA_DEFAULT_ASPECT,
  cameraBubbleChromeStyle,
  cameraBubblePosition,
  cameraBubbleSizeNorm,
  cameraSnapPresetLabel,
  cameraSnapTargets,
  cycleCameraShape,
  cycleCameraSnapPreset,
  matchCameraSnapTarget,
  nudgeCameraLayout,
  nudgeCameraSize,
  placeCameraAtPoint,
  resetCameraLayout,
  type CameraNudgeDirection,
  type CameraOverlayStyle,
} from '../../shared/camera'

export interface CameraLayoutMapProps {
  style: CameraOverlayStyle
  /** When set, clicks/drag/wheel/keys place or resize the bubble (preview ≡ export coords). */
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
 * Interaction (FOKUS 3B) — full keyboard parity with live bubble because the
 * bubble is hidden on the capture preview while recording:
 * - Click or drag to place (magnetic snap) + snap guide dots while dragging
 * - Scroll wheel to resize (Shift = larger steps)
 * - Arrows nudge · +/- resize · [ ] snap cycle · C shape · 0 / double-click reset
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

  // Same 8 magnetic targets as live CameraBubble (corners + edge mids).
  const { w: guideW, h: guideH } = cameraBubbleSizeNorm(
    style.sizePercent,
    frameAspect,
    style.heightPercent,
  )
  const guideTargets = dragging
    ? cameraSnapTargets(style.sizePercent, frameAspect, style.heightPercent)
    : []

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
    if (!interactive || !onLayoutChange) return

    const arrowMap: Record<string, CameraNudgeDirection> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
    }
    const arrow = arrowMap[e.key]
    if (arrow) {
      e.preventDefault()
      e.stopPropagation()
      onLayoutChange(
        nudgeCameraLayout(styleRef.current, arrow, {
          shift: e.shiftKey,
          frameAspect,
        }),
      )
      return
    }

    if (e.key === ']' || e.key === '[') {
      e.preventDefault()
      e.stopPropagation()
      onLayoutChange(
        cycleCameraSnapPreset(
          styleRef.current,
          e.key === ']' ? 'next' : 'prev',
          frameAspect,
        ),
      )
      return
    }

    if (e.key === 'c' || e.key === 'C') {
      e.preventDefault()
      e.stopPropagation()
      onLayoutChange(
        cycleCameraShape(styleRef.current, e.shiftKey ? 'prev' : 'next', frameAspect),
      )
      return
    }

    if (e.key === '0') {
      e.preventDefault()
      e.stopPropagation()
      onLayoutChange(resetCameraLayout(styleRef.current, frameAspect))
      return
    }

    const grow = e.key === '+' || e.key === '=' || e.key === 'Add'
    const shrink = e.key === '-' || e.key === '_' || e.key === 'Subtract'
    if (grow || shrink) {
      e.preventDefault()
      e.stopPropagation()
      onLayoutChange(
        nudgeCameraSize(styleRef.current, grow ? 'grow' : 'shrink', {
          shift: e.shiftKey,
          frameAspect,
        }),
      )
      return
    }

    // Numpad-style corners: 7/9/1/3 ≈ TL/TR/BL/BR; 5 = center.
    // (Digits 1/2/3 size presets stay on the live bubble — 1/3 conflict here.)
    const placeMap: Record<string, { x: number; y: number }> = {
      '7': { x: 0.08, y: 0.08 },
      '9': { x: 0.92, y: 0.08 },
      '1': { x: 0.08, y: 0.92 },
      '3': { x: 0.92, y: 0.92 },
      '5': { x: 0.5, y: 0.5 },
    }
    const hit = placeMap[e.key]
    if (!hit) return
    e.preventDefault()
    e.stopPropagation()
    onLayoutChange(placeCameraAtPoint(styleRef.current, hit.x, hit.y, frameAspect))
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

  function onDoubleClick(e: ReactMouseEvent<HTMLDivElement>) {
    if (!interactive || !onLayoutChange) return
    e.preventDefault()
    e.stopPropagation()
    onLayoutChange(resetCameraLayout(styleRef.current, frameAspect))
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
            ? 'Drag to place (snap guides) · scroll or +/- resize · arrows nudge · [ ] snap · C shape · 0 / double-click reset'
            : undefined
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
      >
        {dragging ? (
          <div className="camera-layout-map__guides" aria-hidden="true">
            {guideTargets.map((t) => (
              <span
                key={t.id}
                className={`camera-layout-map__guide${
                  snap === t.id ? ' camera-layout-map__guide--active' : ''
                }`}
                style={{
                  left: `${(t.x + guideW / 2) * 100}%`,
                  top: `${(t.y + guideH / 2) * 100}%`,
                }}
              />
            ))}
          </div>
        ) : null}
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
            // Snap jumps feel sticky without CSS easing fighting the drag.
            transition: dragging ? 'none' : undefined,
          }}
          aria-hidden
        />
      </div>
      <span className="camera-layout-map__label" role="status">
        Layout · {label}
        {interactive ? ' · drag · snap guides · keys / scroll' : ''}
      </span>
    </div>
  )
}
