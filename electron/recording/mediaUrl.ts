/**
 * Safe media URLs for temp capture files (playback in renderer).
 * Uses screenflow-media:// so http:// dev server is not blocked from loading temp files.
 */

import fs from 'node:fs'
import { assertUnderScreenFlowTemp } from '../ffmpeg/transcode.js'
import { buildScreenFlowMediaUrl } from '../protocol/mediaProtocol.js'

export function getScreenFlowMediaUrl(filePath: string): string {
  const resolved = assertUnderScreenFlowTemp(filePath)
  if (!fs.existsSync(resolved)) {
    throw new Error('Media file not found')
  }
  return buildScreenFlowMediaUrl(resolved)
}
