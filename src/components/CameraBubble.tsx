import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  applyCameraSizePreset,
  cameraBubblePosition,
  cameraBubbleSizeNorm,
  cameraSizePresetFromDigitKey,
  cameraSnapTargets,
  normalizeCameraOverlay,
  nudgeCameraLayout,
  nudgeCameraSize,
  resetCameraLayout,
  resizeCameraFromHandle,
  snapCameraLayout,
  type CameraNudgeDirection,
  type CameraOverlayStyle,
  type CameraResizeHandle,
  type CameraSnapTarget,
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
  /**
   * Override mirror; when omitted, uses `style.mirrored` (FaceTime selfie default).
   * Prefer editing style.mirrored so preview ≡ export.
   */
  mirrored?: boolean
  style: CameraOverlayStyle
  /** Extra class on the root bubble (e.g. muted preview chrome). */
  className?: string
  label?: string
  /**
   * When set, bubble is draggable/resizable; pointer-up snaps to corner/edge after drag.
   * Parent should persist the returned style (preview ≡ export coords).
   */
  onLayoutChange?: (next: CameraOverlayStyle) => void
  /** Frame aspect (width/height) for snap/clamp; defaults from parent box. */
  frameAspect?: number
}

const SYNC_EPSILON_SEC = 0.08

const RESIZE_HANDLES: readonly CameraResizeHandle[] = ['nw', 'ne', 'sw', 'se']

/** FaceTime/webcam bubble over a positioned preview frame (live or recorded). */
export function CameraBubble({
  stream = null,
  mediaUrl = null,
  currentTimeSec,
  playing = false,
  mirrored,
  style,
  className = '',
  label = 'Camera',
  onLayoutChange,
  frameAspect,
}: CameraBubbleProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [readySourceKey, setReadySourceKey] = useState<string | null>(null)
  const [dragStyle, setDragStyle] = useState<CameraOverlayStyle | null>(null)
  const [resizeActive, setResizeActive] = useState(false)
  const [snapTarget, setSnapTarget] = useState<CameraSnapTarget | null>(null)
  const [guideParent, setGuideParent] = useState<HTMLElement | null>(null)
  const [dragAspect, setDragAspect] = useState<number | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    originX: number
    originY: number
    parentW: number
    parentH: number
    aspect: number
  } | null>(null)
  const resizeRef = useRef<{
    handle: CameraResizeHandle
    pointerId: number
    parentW: number
    parentH: number
    aspect: number
    base: CameraOverlayStyle
  } | null>(null)

  const displayStyle = dragStyle ?? style
  const posAspect =
    frameAspect && frameAspect > 0
      ? frameAspect
      : dragAspect && dragAspect > 0
        ? dragAspect
        : 16 / 9
  const pos = cameraBubblePosition(displayStyle, posAspect)
  const mirrorVideo = mirrored ?? displayStyle.mirrored
  const useRecorded = Boolean(mediaUrl)
  const active = style.enabled && (useRecorded || Boolean(stream))
  const sourceKey = useRecorded ? `rec:${mediaUrl ?? ''}` : `live:${stream?.id ?? ''}`
  const hasFrames = readySourceKey === sourceKey
  const interactive = Boolean(onLayoutChange)
  const dragging = Boolean(dragStyle && !resizeActive)

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

  function resolveAspect(parentW: number, parentH: number): number {
    if (frameAspect && frameAspect > 0) return frameAspect
    if (parentW > 0 && parentH > 0) return parentW / parentH
    return 16 / 9
  }

  function parentMetrics(): { parentW: number; parentH: number; aspect: number } | null {
    const root = rootRef.current
    const parent = root?.offsetParent as HTMLElement | null
    if (!root || !parent) return null
    const parentRect = parent.getBoundingClientRect()
    if (parentRect.width <= 0 || parentRect.height <= 0) return null
    return {
      parentW: parentRect.width,
      parentH: parentRect.height,
      aspect: resolveAspect(parentRect.width, parentRect.height),
    }
  }

  function clientToFrame(
    clientX: number,
    clientY: number,
    parentW: number,
    parentH: number,
  ): { x: number; y: number } {
    const parent = rootRef.current?.offsetParent as HTMLElement | null
    if (!parent) return { x: 0, y: 0 }
    const rect = parent.getBoundingClientRect()
    return {
      x: (clientX - rect.left) / parentW,
      y: (clientY - rect.top) / parentH,
    }
  }

  function onMovePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive || !onLayoutChange) return
    if (e.button !== 0) return
    if ((e.target as HTMLElement | null)?.dataset?.resizeHandle) return

    const metrics = parentMetrics()
    if (!metrics) return

    const base = normalizeCameraOverlay(style, metrics.aspect)
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    // Focus so arrow-key nudge works after click/drag.
    e.currentTarget.focus({ preventScroll: true })
    resizeRef.current = null
    setResizeActive(false)
    setSnapTarget(null)
    setGuideParent(rootRef.current?.offsetParent as HTMLElement | null)
    setDragAspect(metrics.aspect)
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: base.x,
      originY: base.y,
      parentW: metrics.parentW,
      parentH: metrics.parentH,
      aspect: metrics.aspect,
    }
    setDragStyle(base)
  }

  function onBubbleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!interactive || !onLayoutChange) return
    if (dragRef.current || resizeRef.current) return
    const map: Record<string, CameraNudgeDirection> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
    }
    const direction = map[e.key]
    const metrics = parentMetrics()
    const aspect = metrics?.aspect ?? frameAspect ?? 16 / 9

    if (direction) {
      e.preventDefault()
      e.stopPropagation()
      onLayoutChange(
        nudgeCameraLayout(style, direction, { shift: e.shiftKey, frameAspect: aspect }),
      )
      return
    }

    // 1/2/3 → S/M/L size presets; 0 → reset bottom-right + medium.
    const sizePreset = cameraSizePresetFromDigitKey(e.key)
    if (sizePreset) {
      e.preventDefault()
      e.stopPropagation()
      onLayoutChange(applyCameraSizePreset(style, sizePreset, aspect))
      return
    }
    if (e.key === '0') {
      e.preventDefault()
      e.stopPropagation()
      onLayoutChange(resetCameraLayout(style, aspect))
      return
    }

    // +/- (and =/_ without shift) grow/shrink width; Shift = larger step.
    const grow =
      e.key === '+' || e.key === '=' || e.key === 'Add'
    const shrink =
      e.key === '-' || e.key === '_' || e.key === 'Subtract'
    if (!grow && !shrink) return
    e.preventDefault()
    e.stopPropagation()
    onLayoutChange(
      nudgeCameraSize(style, grow ? 'grow' : 'shrink', {
        shift: e.shiftKey,
        frameAspect: aspect,
      }),
    )
  }

  function onBubbleDoubleClick(e: ReactMouseEvent<HTMLDivElement>) {
    if (!interactive || !onLayoutChange) return
    // Ignore double-clicks on resize handles.
    if ((e.target as HTMLElement).closest('[data-resize-handle]')) return
    e.preventDefault()
    e.stopPropagation()
    const metrics = parentMetrics()
    const aspect = metrics?.aspect ?? frameAspect ?? 16 / 9
    onLayoutChange(resetCameraLayout(style, aspect))
  }

  function onResizePointerDown(e: ReactPointerEvent<HTMLSpanElement>, handle: CameraResizeHandle) {
    if (!interactive || !onLayoutChange) return
    if (e.button !== 0) return
    const metrics = parentMetrics()
    if (!metrics) return

    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = null
    setSnapTarget(null)
    setGuideParent(null)
    const base = normalizeCameraOverlay(style, metrics.aspect)
    resizeRef.current = {
      handle,
      pointerId: e.pointerId,
      parentW: metrics.parentW,
      parentH: metrics.parentH,
      aspect: metrics.aspect,
      base,
    }
    setResizeActive(true)
    setDragStyle(base)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const resize = resizeRef.current
    if (resize && resize.pointerId === e.pointerId) {
      const { x, y } = clientToFrame(e.clientX, e.clientY, resize.parentW, resize.parentH)
      setDragStyle(resizeCameraFromHandle(resize.base, resize.handle, x, y, resize.aspect))
      return
    }

    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = (e.clientX - drag.startClientX) / drag.parentW
    const dy = (e.clientY - drag.startClientY) / drag.parentH
    // Live magnetic snap: preview jumps to corner/edge when within threshold.
    const snapped = snapCameraLayout(
      drag.originX + dx,
      drag.originY + dy,
      style.sizePercent,
      drag.aspect,
      undefined,
      style.heightPercent,
    )
    setSnapTarget(snapped.snapped ? snapped.target : null)
    setDragStyle(
      normalizeCameraOverlay(
        {
          ...style,
          anchor: snapped.corner ?? 'free',
          corner: snapped.corner ?? style.corner,
          x: snapped.x,
          y: snapped.y,
        },
        drag.aspect,
      ),
    )
  }

  function finishPointer(e: ReactPointerEvent<HTMLElement>) {
    const resize = resizeRef.current
    if (resize && resize.pointerId === e.pointerId && onLayoutChange) {
      resizeRef.current = null
      setResizeActive(false)
      setSnapTarget(null)
      setGuideParent(null)
      setDragAspect(null)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      const { x, y } = clientToFrame(e.clientX, e.clientY, resize.parentW, resize.parentH)
      const next = resizeCameraFromHandle(resize.base, resize.handle, x, y, resize.aspect)
      setDragStyle(null)
      onLayoutChange(next)
      return
    }

    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId || !onLayoutChange) return
    dragRef.current = null
    setSnapTarget(null)
    setGuideParent(null)
    setDragAspect(null)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }

    const dx = (e.clientX - drag.startClientX) / drag.parentW
    const dy = (e.clientY - drag.startClientY) / drag.parentH
    const snapped = snapCameraLayout(
      drag.originX + dx,
      drag.originY + dy,
      style.sizePercent,
      drag.aspect,
      undefined,
      style.heightPercent,
    )

    const next = normalizeCameraOverlay(
      {
        ...style,
        x: snapped.x,
        y: snapped.y,
        anchor: snapped.corner ?? 'free',
        corner: snapped.corner ?? style.corner,
      },
      drag.aspect,
    )
    setDragStyle(null)
    onLayoutChange(next)
  }

  if (!active) return null

  const guideAspect = dragAspect ?? frameAspect ?? 16 / 9
  const guideTargets =
    dragging && guideParent
      ? cameraSnapTargets(
          displayStyle.sizePercent,
          guideAspect,
          displayStyle.heightPercent,
        )
      : []
  const { w: guideW, h: guideH } = cameraBubbleSizeNorm(
    displayStyle.sizePercent,
    guideAspect,
    displayStyle.heightPercent,
  )

  return (
    <>
      <div
        ref={rootRef}
        className={`camera-bubble ${useRecorded ? 'camera-bubble--fixed' : ''} ${
          interactive ? 'camera-bubble--interactive' : ''
        } ${dragging ? 'camera-bubble--dragging' : ''} ${
          snapTarget ? 'camera-bubble--snapped' : ''
        } ${resizeActive ? 'camera-bubble--resizing' : ''} ${className}`.trim()}
        style={{
          top: pos.top,
          left: pos.left,
          width: pos.width,
          height: pos.height,
          aspectRatio: pos.aspectRatio,
          borderRadius: pos.borderRadius,
          border: pos.border,
          boxShadow: pos.boxShadow,
          opacity: pos.opacity,
        }}
        aria-label={label}
        tabIndex={interactive ? 0 : undefined}
        title={
          interactive
            ? displayStyle.lockAspect
              ? 'Drag to reposition — snaps to corners & edges · arrows nudge · +/- resize · 1/2/3 size · 0 or double-click reset · corner handles (aspect locked)'
              : 'Drag to reposition — snaps to corners & edges · arrows nudge · +/- resize width · 1/2/3 size · 0 or double-click reset · corner handles free resize'
            : undefined
        }
        onPointerDown={interactive ? onMovePointerDown : undefined}
        onPointerMove={interactive ? onPointerMove : undefined}
        onPointerUp={interactive ? finishPointer : undefined}
        onPointerCancel={interactive ? finishPointer : undefined}
        onDoubleClick={interactive ? onBubbleDoubleClick : undefined}
        onKeyDown={interactive ? onBubbleKeyDown : undefined}
      >
        <video
          ref={videoRef}
          className={
            mirrorVideo
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
        {interactive
          ? RESIZE_HANDLES.map((handle) => (
              <span
                key={handle}
                className={`camera-bubble__handle camera-bubble__handle--${handle}`}
                data-resize-handle={handle}
                role="slider"
                aria-label={`Resize camera ${handle}`}
                aria-valuemin={12}
                aria-valuemax={40}
                aria-valuenow={displayStyle.sizePercent}
                onPointerDown={(e) => onResizePointerDown(e, handle)}
                onPointerMove={onPointerMove}
                onPointerUp={finishPointer}
                onPointerCancel={finishPointer}
              />
            ))
          : null}
      </div>
      {dragging && guideParent
        ? createPortal(
            <div className="camera-snap-guides" aria-hidden="true">
              {guideTargets.map((t) => (
                <span
                  key={t.id}
                  className={`camera-snap-guide${
                    snapTarget === t.id ? ' camera-snap-guide--active' : ''
                  }`}
                  style={{
                    left: `${(t.x + guideW / 2) * 100}%`,
                    top: `${(t.y + guideH / 2) * 100}%`,
                  }}
                />
              ))}
            </div>,
            guideParent,
          )
        : null}
    </>
  )
}
