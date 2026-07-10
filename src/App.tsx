import { useEffect, useState } from 'react'
import type { AppInfo } from '../shared/ipc'
import { fetchAppInfo } from './lib/runtime'
import './App.css'

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchAppInfo().then((next) => {
      if (!cancelled) setInfo(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="shell">
      <div className="shell__atmosphere" aria-hidden="true" />
      <header className="shell__top">
        <p className="shell__brand">Screen Flow</p>
        <p className="shell__meta">
          {info
            ? `${info.runtime} · ${info.platform} · v${info.version}`
            : 'connecting…'}
        </p>
      </header>

      <main className="shell__stage">
        <section className="shell__hero" aria-labelledby="hero-title">
          <h1 id="hero-title" className="shell__title">
            Record. Zoom. Export.
          </h1>
          <p className="shell__lede">
            Desktop screen recording with cinematic auto-zoom, cursor polish, and
            hardware-accelerated export — built for macOS first.
          </p>
          <div className="shell__actions">
            <button type="button" className="btn btn--primary" disabled>
              Start recording
            </button>
            <button type="button" className="btn btn--ghost" disabled>
              Open project
            </button>
          </div>
        </section>

        <aside className="shell__preview" aria-label="Preview placeholder">
          <div className="preview-frame">
            <div className="preview-frame__glow" />
            <p className="preview-frame__label">Preview</p>
            <p className="preview-frame__hint">
              Capture pipeline lands next — desktopCapturer MVP, then
              ScreenCaptureKit.
            </p>
          </div>
        </aside>
      </main>
    </div>
  )
}
