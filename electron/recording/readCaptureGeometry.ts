/**
 * Read capture-geometry.json from a guarded temp session path.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  CAPTURE_GEOMETRY_FILENAME,
  isCaptureGeometry,
  type CaptureGeometry,
} from '../../shared/cursorCoords.js'
import { assertUnderScreenFlowTemp } from '../ffmpeg/transcode.js'

export function readCaptureGeometryFile(
  geometryPath: string,
): CaptureGeometry | null {
  const resolved = assertUnderScreenFlowTemp(geometryPath)
  if (!fs.existsSync(resolved)) return null
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(resolved, 'utf8'))
    return isCaptureGeometry(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Sibling of cursor-events.jsonl / capture.webm in the session dir. */
export function readCaptureGeometryBeside(filePath: string): CaptureGeometry | null {
  const dir = path.dirname(assertUnderScreenFlowTemp(filePath))
  return readCaptureGeometryFile(path.join(dir, CAPTURE_GEOMETRY_FILENAME))
}
