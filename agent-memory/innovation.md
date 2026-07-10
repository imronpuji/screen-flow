# Screen Flow — Innovation Backlog

`[ ]` belum · `[~]` proses · `[x]` selesai

## Fondasi

- [x] Electron + React + TS boilerplate (main/preload/renderer, contextIsolation)
- [x] IPC typed: app info, permission status, sources list, recording stub session
- [x] Izin TCC Screen Recording (macOS) — probe + UX saat ditolak
- [x] Capture dasar via `desktopCapturer` (list + getUserMedia/MediaRecorder → temp WebM)
- [x] Simpan frame/stream via ffmpeg (child process di main) — WebM → MP4 export
- [~] Preview real-time (canvas) — live `<video>` preview done; canvas/WebGL later
- [x] Export MP4 (H.264; VideoToolbox di macOS, libx264 fallback) — progress/cancel + Save As → Documents + quality presets (Draft/Good/High) done

## Signature (Screen Studio-like)

- [x] Cursor event capture (posisi + klik) — JSONL per session via uIOhook + poll fallback
- [~] Auto-zoom ikut klik (spring/cubic-bezier) — engine + preview + export bake + Retina DIP mapping + anti-jitter
- [x] Cursor smoothing + efek klik + size/style/hide/spotlight — preview + export bake
- [~] Background gradient, padding, rounded corners, shadow — preview + export bake (1-frame alpha mask) + **frame layout presets (Compact/Standard/Wide/Flat)** + **persist prefs**
- [~] Timeline editor — clip markers (zoom spans + click ticks + **camera active-range spans** + seek) + per-click zoom points (enable/scale) + **add-at-playhead (Z)** + **focus nudge** + **camera mute-window edit + scrubber edge drag**; background frame layouts done

## Nanti

- [x] Preset background — color swatches + **frame layout presets** (Compact/Standard/Wide/Flat) + corner radius slider + **persist prefs**
- [ ] Export GIF / WebM
- [~] Webcam overlay — enumerate + live bubble + TCC/media permission + parallel camera.webm + review playback + ffmpeg export bake + free drag/snap + **mid-edge magnetic snap + 8 position presets** + corner resize + circle/rounded/rectangle shapes + border/shadow bake + outline color picker + mirror + opacity + A/V drift compensation + mid-recording mute/unmute (activeRanges) + **timeline active-range markers** + **review edit mute windows** + **scrubber edge drag-resize** + **mic on same camera MediaRecorder (export AAC)** + **persist prefs + review→setup sync** + **free aspect unlock (rectangle/rounded)** + **arrow-key nudge** + **size nudge (+/-) + S/M/L + keys 1/2/3 + layout reset (0/dblclick)** + **`[`/`]` snap cycle + `C` shape cycle** + **hot-plug devicechange + soft inactive on track end**; visual verify on Mac still open
- [x] One-click beautify — Tutorial / Product demo / Social presets (review)- [~] First-run onboarding — 3-step overlay + localStorage done flag
- [ ] Auto-highlight klik
- [x] Keyboard shortcuts — setup R/Space; review Space/E/B/arrows/Esc; exporting Esc
- [x] Empty-state tooltips — catalog + hover tips + empty source/camera hints
- [ ] ScreenCaptureKit helper (kualitas native)
- [ ] Windows capture path
