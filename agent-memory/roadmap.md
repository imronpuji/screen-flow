# Screen Flow — Product Roadmap

Status flow keseluruhan. `[ ]` belum · `[~]` proses · `[x]` selesai (fungsional + user-friendly).

- [x] 1. Fondasi Electron+React+TS
- [x] 2. Izin & capture dasar (desktopCapturer + TCC probe)
- [x] 3. Simpan rekaman (MediaRecorder → temp WebM + ffmpeg export)
- [~] 4. Preview & playback — review mode + scrub/trim preview + cursor overlay
- [~] 5. ⭐ Auto-zoom PRESISI — engine + preview + export bake + Retina/DIP mapping + anti-jitter merge/retarget + per-click enable/scale edits
- [~] 6. ⭐ Cursor bisa dimodifikasi — smoothing + click ring + size/style/hide/spotlight preview/export
- [~] 7. ⭐ Kamera FaceTime / webcam overlay — enumerate + live bubble + TCC + review play-sync + parallel camera.webm + export bake + free drag/snap + **mid-edge magnetic snap + 8 position presets** + corner resize (aspect lock **+ free unlock for rectangle/rounded**) + **arrow-key nudge (Shift=larger)** + **size nudge (+/-) + S/M/L presets** + shapes circle/rounded/rectangle + border/shadow bake + outline color picker + mirror + opacity + A/V drift compensation + mid-recording toggle + **mic on same MediaRecorder track (export AAC, mute with camera)** + **persist overlay prefs (localStorage) + review→setup sync**; live bubble hidden while recording (no burn-in double)
- [~] 8. Background estetik — gradient/padding/rounded/shadow preview + export bake (1-frame mask)
- [~] 9. Editor ringan — trim sliders + auto-zoom/cursor/background/camera toggles; trim baked ke export MP4; timeline clip markers (zoom/click seek); per-click zoom points (toggle + scale)
- [~] 10. Export MP4 — progress/cancel + Save As + effects bake + quality presets (Draft/Good/High)
- [~] 11. Polish user-friendly & onboarding — first-run 3-step overlay + Beautify presets + keyboard shortcuts (R/Space/E/B/←→/Esc) + empty-state tooltips
