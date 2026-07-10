# Screen Flow

Cinematic desktop screen recorder inspired by Screen Studio — auto-zoom, cursor smoothing, aesthetic backgrounds, MP4/GIF export.

**Stack:** Electron · React · TypeScript · ffmpeg  
**Platform:** macOS first (Windows later)

## Architecture

| Process | Role |
|---------|------|
| **Main** (`electron/`) | OS APIs, capture, ffmpeg spawn, filesystem, IPC |
| **Preload** (`electron/preload.ts`) | `contextBridge` — typed API only |
| **Renderer** (`src/`) | React UI, timeline, preview — stay at 60fps |
| **Shared** (`shared/`) | IPC channel names + payload types |

Security defaults: `contextIsolation: true`, `nodeIntegration: false`.

## Scripts

```bash
npm install
npm run dev            # Vite renderer only (browser fallback)
npm run build          # renderer + electron main/preload
npm run typecheck
npm run lint
```

Electron GUI requires a desktop environment (macOS target). CI/agents validate with `typecheck` + `build`.

## Agent memory

Incremental autonomous work is tracked in `agent-memory/` (`decisions.md`, `work-log.md`, `innovation.md`).

## Status

Bootstrap: Electron shell + typed IPC + Screen Flow UI. Capture/export pipeline next.
