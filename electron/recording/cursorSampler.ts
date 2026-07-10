/**
 * Global cursor sampler during recording.
 * Primary: uIOhook (position + clicks). Fallback: Electron screen cursor polling (position only).
 */

import { screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { uIOhook } from 'uiohook-napi'
import { CURSOR_EVENTS_FILENAME, type CursorEvent } from '../../shared/cursor.js'
import {
  mapUiohookKind,
  normalizeCursorButton,
  serializeCursorEvent,
  shouldSampleMove,
  type MoveSampleState,
} from './cursorEvents.js'

const POLL_INTERVAL_MS = 16

export interface CursorSamplerStats {
  eventsPath: string | null
  eventCount: number
  bytesWritten: number
  /** How events were captured — useful for debugging permission issues. */
  mode: 'uiohook' | 'poll' | 'none'
}

interface ActiveSampler {
  eventsPath: string
  startedAt: number
  stream: fs.WriteStream
  writeQueue: Promise<void>
  eventCount: number
  bytesWritten: number
  mode: 'uiohook' | 'poll'
  cleanup: () => void
  moveState: MoveSampleState
}

let active: ActiveSampler | null = null

function queueWrite(sampler: ActiveSampler, event: CursorEvent): void {
  const line = serializeCursorEvent(event)
  sampler.writeQueue = sampler.writeQueue.then(
    () =>
      new Promise<void>((resolve, reject) => {
        sampler.stream.write(line, (err) => {
          if (err) reject(err)
          else resolve()
        })
      }),
  )
  sampler.eventCount += 1
  sampler.bytesWritten += Buffer.byteLength(line, 'utf8')
  sampler.moveState = { lastT: event.t, lastX: event.x, lastY: event.y }
}

function appendEvent(sampler: ActiveSampler, partial: Omit<CursorEvent, 't'> & { t?: number }): void {
  const event: CursorEvent = {
    t: partial.t ?? Math.max(0, Date.now() - sampler.startedAt),
    x: Math.round(partial.x),
    y: Math.round(partial.y),
    kind: partial.kind,
    ...(partial.button != null ? { button: partial.button } : {}),
  }

  if (event.kind === 'move' && !shouldSampleMove(sampler.moveState, event)) {
    return
  }

  queueWrite(sampler, event)
}

function tryStartUiohook(sampler: ActiveSampler): boolean {
  try {

    const onMove = (e: { x: number; y: number }) => {
      appendEvent(sampler, { x: e.x, y: e.y, kind: 'move' })
    }
    const onDown = (e: { x: number; y: number; button: unknown }) => {
      appendEvent(sampler, {
        x: e.x,
        y: e.y,
        kind: 'down',
        button: normalizeCursorButton(e.button),
      })
    }
    const onUp = (e: { x: number; y: number; button: unknown }) => {
      appendEvent(sampler, {
        x: e.x,
        y: e.y,
        kind: 'up',
        button: normalizeCursorButton(e.button),
      })
    }
    const onClick = (e: { x: number; y: number; button: unknown }) => {
      appendEvent(sampler, {
        x: e.x,
        y: e.y,
        kind: mapUiohookKind('click'),
        button: normalizeCursorButton(e.button),
      })
    }

    uIOhook.on('mousemove', onMove)
    uIOhook.on('mousedown', onDown)
    uIOhook.on('mouseup', onUp)
    uIOhook.on('click', onClick)
    uIOhook.start()

    sampler.cleanup = () => {
      uIOhook.removeListener('mousemove', onMove)
      uIOhook.removeListener('mousedown', onDown)
      uIOhook.removeListener('mouseup', onUp)
      uIOhook.removeListener('click', onClick)
      uIOhook.stop()
    }

    return true
  } catch {
    return false
  }
}

function startPollFallback(sampler: ActiveSampler): void {
  const timer = setInterval(() => {
    try {
      const point = screen.getCursorScreenPoint()
      appendEvent(sampler, { x: point.x, y: point.y, kind: 'move' })
    } catch {
      /* headless / unsupported — ignore tick */
    }
  }, POLL_INTERVAL_MS)

  sampler.cleanup = () => {
    clearInterval(timer)
  }
}

export function startCursorSampler(options: {
  sessionDir: string
  startedAt: number
}): CursorSamplerStats {
  if (active) {
    throw new Error('Cursor sampler already active')
  }

  const eventsPath = path.join(options.sessionDir, CURSOR_EVENTS_FILENAME)
  const stream = fs.createWriteStream(eventsPath, { flags: 'w' })

  const sampler: ActiveSampler = {
    eventsPath,
    startedAt: options.startedAt,
    stream,
    writeQueue: Promise.resolve(),
    eventCount: 0,
    bytesWritten: 0,
    mode: 'poll',
    cleanup: () => undefined,
    moveState: { lastT: -Infinity, lastX: 0, lastY: 0 },
  }

  const uiohookOk = tryStartUiohook(sampler)
  sampler.mode = uiohookOk ? 'uiohook' : 'poll'
  if (!uiohookOk) {
    startPollFallback(sampler)
  }

  active = sampler

  return {
    eventsPath,
    eventCount: 0,
    bytesWritten: 0,
    mode: sampler.mode,
  }
}

export async function stopCursorSampler(): Promise<CursorSamplerStats> {
  if (!active) {
    return { eventsPath: null, eventCount: 0, bytesWritten: 0, mode: 'none' }
  }

  const sampler = active
  active = null
  sampler.cleanup()

  await sampler.writeQueue
  await new Promise<void>((resolve, reject) => {
    sampler.stream.end((err: Error | null | undefined) => {
      if (err) reject(err)
      else resolve()
    })
  })

  return {
    eventsPath: sampler.eventCount > 0 ? sampler.eventsPath : null,
    eventCount: sampler.eventCount,
    bytesWritten: sampler.bytesWritten,
    mode: sampler.mode,
  }
}

/** Test-only reset when sampler was not stopped cleanly. */
export function resetCursorSamplerForTests(): void {
  if (active) {
    active.cleanup()
    active.stream.destroy()
    active = null
  }
}
