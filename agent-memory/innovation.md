# Screen Flow — Innovation Backlog

`[ ]` belum · `[~]` proses · `[x]` selesai

## Fondasi

- [x] Electron + React + TS boilerplate (main/preload/renderer, contextIsolation)
- [x] IPC typed: app info, permission status, sources list, recording stub session
- [x] Izin TCC Screen Recording (macOS) — probe + UX saat ditolak
- [x] Capture dasar via `desktopCapturer` (list + getUserMedia/MediaRecorder → temp WebM)
- [x] Simpan frame/stream via ffmpeg (child process di main) — WebM → MP4 export
- [~] Preview real-time (canvas) — live `<video>` preview done; canvas/WebGL later
- [x] Export MP4 (H.264; VideoToolbox di macOS, libx264 fallback) — progress/cancel + Save As → Documents done

## Signature (Screen Studio-like)

- [x] Cursor event capture (posisi + klik) — JSONL per session via uIOhook + poll fallback
- [~] Auto-zoom ikut klik (spring/cubic-bezier) — engine + preview + export bake
- [x] Cursor smoothing + efek klik + size/style/hide/spotlight — preview + export bake
- [~] Background gradient, padding, rounded corners, shadow — preview + export bake (1-frame alpha mask)
- [ ] Timeline editor

## Nanti

- [ ] Preset background
- [ ] Export GIF / WebM
- [x] Webcam overlay — enumerate + live bubble + parallel camera.webm + review playback + ffmpeg export bake
- [ ] Auto-highlight klik
- [ ] ScreenCaptureKit helper (kualitas native)
- [ ] Windows capture path
