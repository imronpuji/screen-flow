/**
 * Load camera-sync.json written at stopRecording (first-chunk wall offsets).
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  CAMERA_SYNC_FILENAME,
  parseCameraSyncMeta,
  type CameraSyncMeta,
} from '../../shared/cameraSync.js'

export function readCameraSyncFile(syncPath: string): CameraSyncMeta | null {
  try {
    if (!fs.existsSync(syncPath)) return null
    const raw = JSON.parse(fs.readFileSync(syncPath, 'utf8')) as unknown
    return parseCameraSyncMeta(raw)
  } catch {
    return null
  }
}

/** Prefer explicit path; else sibling camera-sync.json next to camera.webm. */
export function resolveCameraSyncMeta(
  cameraPath: string,
  syncPath?: string | null,
): CameraSyncMeta | null {
  if (syncPath) {
    const fromExplicit = readCameraSyncFile(syncPath)
    if (fromExplicit) return fromExplicit
  }
  const sibling = path.join(path.dirname(cameraPath), CAMERA_SYNC_FILENAME)
  return readCameraSyncFile(sibling)
}
