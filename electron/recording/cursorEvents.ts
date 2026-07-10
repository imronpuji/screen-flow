/**
 * Pure helpers for cursor event JSONL — smoke-testable without Electron or uIOhook.
 */

import type { CursorButton, CursorEvent, CursorEventKind } from '../../shared/cursor.js'

const MOVE_MIN_INTERVAL_MS = 16
const MOVE_MIN_DELTA_PX = 2

export function serializeCursorEvent(event: CursorEvent): string {
  return `${JSON.stringify(event)}\n`
}

export function parseCursorEventLine(line: string): CursorEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const parsed = JSON.parse(trimmed) as CursorEvent
  if (
    typeof parsed.t !== 'number' ||
    typeof parsed.x !== 'number' ||
    typeof parsed.y !== 'number' ||
    typeof parsed.kind !== 'string'
  ) {
    throw new Error('Invalid cursor event line')
  }
  return parsed
}

export function normalizeCursorButton(button: unknown): CursorButton | undefined {
  if (typeof button !== 'number' || !Number.isFinite(button)) return undefined
  const idx = Math.floor(button)
  if (idx < 0 || idx > 2) return undefined
  return idx as CursorButton
}

export function mapUiohookKind(
  type: 'mousemove' | 'mousedown' | 'mouseup' | 'click',
): CursorEventKind {
  switch (type) {
    case 'mousemove':
      return 'move'
    case 'mousedown':
      return 'down'
    case 'mouseup':
      return 'up'
    case 'click':
      return 'click'
  }
}

export interface MoveSampleState {
  lastT: number
  lastX: number
  lastY: number
}

export function shouldSampleMove(
  state: MoveSampleState,
  next: Pick<CursorEvent, 't' | 'x' | 'y'>,
): boolean {
  const dt = next.t - state.lastT
  if (dt >= MOVE_MIN_INTERVAL_MS) return true
  const dx = next.x - state.lastX
  const dy = next.y - state.lastY
  return dx * dx + dy * dy >= MOVE_MIN_DELTA_PX * MOVE_MIN_DELTA_PX
}
