/**
 * Smoke checks for export size estimates (format × quality × duration).
 * Requires `npm run build:electron` so dist-electron shared modules resolve.
 */
import {
  EXPORT_AUDIO_BITRATE_BPS,
  estimateExportSize,
  formatEstimateBytes,
  gifApproxBytesPerSecond,
  parseBitrateBps,
  webmApproxBitrateBps,
} from '../dist-electron/shared/exportSizeEstimate.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testParseBitrate(): void {
  assert(parseBitrateBps('4M') === 4_000_000, '4M')
  assert(parseBitrateBps('8M') === 8_000_000, '8M')
  assert(parseBitrateBps('16M') === 16_000_000, '16M')
  assert(parseBitrateBps('128k') === 128_000, '128k')
  assert(parseBitrateBps('bad') === 0, 'bad → 0')
  assert(parseBitrateBps('') === 0, 'empty → 0')
  console.log('ok parse bitrate')
}

function testFormatBytes(): void {
  assert(formatEstimateBytes(500) === '500 B', 'bytes')
  assert(formatEstimateBytes(1536) === '1.5 KB', 'kb')
  assert(formatEstimateBytes(5 * 1024 * 1024) === '5 MB', 'mb')
  console.log('ok format bytes')
}

function testMp4ScalesWithQualityAndDuration(): void {
  const draft = estimateExportSize({
    format: 'mp4',
    quality: 'draft',
    durationMs: 60_000,
  })
  const good = estimateExportSize({
    format: 'mp4',
    quality: 'good',
    durationMs: 60_000,
  })
  const high = estimateExportSize({
    format: 'mp4',
    quality: 'high',
    durationMs: 60_000,
  })
  const short = estimateExportSize({
    format: 'mp4',
    quality: 'good',
    durationMs: 30_000,
  })

  assert(draft.bytes > 0 && good.bytes > draft.bytes, 'good > draft')
  assert(high.bytes > good.bytes, 'high > good')
  assert(short.bytes < good.bytes, 'shorter smaller')
  // 60s @ 8 Mbps ≈ 60 MB mid
  assert(Math.abs(good.bytes - 60_000_000) < 1_000, `good ~60MB got ${good.bytes}`)
  assert(good.label.includes('MB'), `label ${good.label}`)
  assert(good.bytesLow < good.bytes && good.bytesHigh > good.bytes, 'range')
  console.log('ok mp4 scale')
}

function testAudioAddsSize(): void {
  const silent = estimateExportSize({
    format: 'mp4',
    quality: 'good',
    durationMs: 10_000,
    includeAudio: false,
  })
  const mic = estimateExportSize({
    format: 'mp4',
    quality: 'good',
    durationMs: 10_000,
    includeAudio: true,
  })
  const expectedExtra = Math.round((EXPORT_AUDIO_BITRATE_BPS * 10) / 8)
  assert(mic.bytes - silent.bytes === expectedExtra, 'aac delta')
  assert(mic.hint.toLowerCase().includes('mic'), 'mic hint')
  console.log('ok audio')
}

function testWebmAndGif(): void {
  assert(webmApproxBitrateBps('draft') < webmApproxBitrateBps('high'), 'webm rates')
  const webm = estimateExportSize({
    format: 'webm',
    quality: 'good',
    durationMs: 60_000,
  })
  const mp4 = estimateExportSize({
    format: 'mp4',
    quality: 'good',
    durationMs: 60_000,
  })
  assert(webm.bytes < mp4.bytes, 'webm smaller than mp4 good')

  assert(gifApproxBytesPerSecond('draft') < gifApproxBytesPerSecond('high'), 'gif rates')
  const gif = estimateExportSize({
    format: 'gif',
    quality: 'good',
    durationMs: 5_000,
    includeAudio: true, // ignored for gif
  })
  assert(gif.bytes > 0, 'gif bytes')
  assert(gif.hint.toLowerCase().includes('gif'), 'gif hint')
  assert(!gif.hint.toLowerCase().includes('mic'), 'gif ignores mic')
  console.log('ok webm/gif')
}

function testEmptyDuration(): void {
  const empty = estimateExportSize({
    format: 'mp4',
    quality: 'good',
    durationMs: 0,
  })
  assert(empty.bytes === 0, 'zero bytes')
  assert(empty.label === '—', 'dash label')
  console.log('ok empty')
}

testParseBitrate()
testFormatBytes()
testMp4ScalesWithQualityAndDuration()
testAudioAddsSize()
testWebmAndGif()
testEmptyDuration()
console.log('smoke:export-size passed')
