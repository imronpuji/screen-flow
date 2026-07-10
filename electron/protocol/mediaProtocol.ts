/**
 * Custom protocol so the renderer (http://localhost in dev) can play temp WebM/MP4
 * without file:// being blocked by Chromium cross-origin rules.
 */

import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { assertUnderScreenFlowTemp } from '../ffmpeg/transcode.js'

export const SCREENFLOW_MEDIA_SCHEME = 'screenflow-media'

/** Must run before app.whenReady(). */
export function registerScreenFlowMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCREENFLOW_MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        bypassCSP: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ])
}

export function buildScreenFlowMediaUrl(filePath: string): string {
  const resolved = assertUnderScreenFlowTemp(filePath)
  return `${SCREENFLOW_MEDIA_SCHEME}://play?path=${encodeURIComponent(resolved)}`
}

/** Register handler — call inside app.whenReady() before windows load media. */
export async function installScreenFlowMediaProtocol(): Promise<void> {
  await protocol.handle(SCREENFLOW_MEDIA_SCHEME, (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== 'play') {
        return new Response('Not found', { status: 404 })
      }
      const filePath = url.searchParams.get('path')
      if (!filePath) {
        return new Response('Missing path', { status: 400 })
      }
      const resolved = assertUnderScreenFlowTemp(filePath)
      return net.fetch(pathToFileURL(resolved).href)
    } catch {
      return new Response('Forbidden', { status: 403 })
    }
  })
}
