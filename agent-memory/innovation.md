# Screen Flow — Innovation Backlog

`[ ]` belum · `[~]` proses · `[x]` selesai

## Fondasi

- [x] Electron + React + TS boilerplate (main/preload/renderer, contextIsolation)
- [x] IPC typed: app info, permission status, sources list, recording stub session
- [x] Izin TCC Screen Recording (macOS) — probe + UX saat ditolak
- [~] Capture dasar via `desktopCapturer` (list sources done; frame stream next)
- [ ] Simpan frame/stream via ffmpeg (child process di main)
- [ ] Preview real-time (canvas)
- [ ] Export MP4 (H.264; VideoToolbox di macOS)

## Signature (Screen Studio-like)

- [ ] Auto-zoom ikut klik (spring/cubic-bezier)
- [ ] Cursor smoothing + efek klik
- [ ] Background gradient, padding, rounded corners, shadow
- [ ] Timeline editor

## Nanti

- [ ] Preset background
- [ ] Export GIF / WebM
- [ ] Webcam overlay
- [ ] Auto-highlight klik
- [ ] ScreenCaptureKit helper (kualitas native)
- [ ] Windows capture path
