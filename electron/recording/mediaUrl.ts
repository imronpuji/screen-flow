/**
 * Safe file:// URLs for temp capture files (playback in renderer).
 */

import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import { assertUnderScreenFlowTemp } from '../ffmpeg/transcode.js'

export function getScreenFlowMediaUrl(filePath: string): string {
  const resolved = assertUnderScreenFlowTemp(filePath)
  if (!fs.existsSync(resolved)) {
    throw new Error('Media file not found')
  }
  return pathToFileURL(resolved).href
}
