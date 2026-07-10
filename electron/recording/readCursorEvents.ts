/**
 * Read cursor JSONL from a guarded temp session path (IPC helper).
 */

import fs from 'node:fs'
import { assertUnderScreenFlowTemp } from '../ffmpeg/transcode.js'
import type { CursorEvent } from '../../shared/cursor.js'
import { parseCursorEventLine } from './cursorEvents.js'

export function readCursorEventsFile(eventsPath: string): CursorEvent[] {
  const resolved = assertUnderScreenFlowTemp(eventsPath)
  if (!fs.existsSync(resolved)) {
    return []
  }
  const text = fs.readFileSync(resolved, 'utf8')
  const events: CursorEvent[] = []
  for (const line of text.split('\n')) {
    const parsed = parseCursorEventLine(line)
    if (parsed) events.push(parsed)
  }
  return events
}
