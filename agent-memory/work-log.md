# Screen Flow — Work Log

Entri terbaru di ATAS.

## [2026-07-10 04:45] Live capture stream → temp WebM writer

- **Dikerjakan:** Renderer `getUserMedia` + `MediaRecorder` (timeslice 500ms) untuk source terpilih; IPC `recording:append-chunk`; main session membuat temp dir + append-only `capture.webm`; live `<video>` preview + byte/chunk status di UI.
- **Hasil:** `typecheck` + `build` + `lint` hijau.
- **Status:** done
- **Next:** Spawn ffmpeg child process untuk remux/transcode WebM → MP4 (VideoToolbox di macOS) + cleanup temp setelah export.

## [2026-07-10 04:40] IPC sources list + permission + recording stub

- **Dikerjakan:** Extend `shared/ipc.ts` (permission/sources/recording channels); implement `desktopCapturer` list + TCC probe di `electron/capture/`; in-memory recording session stub; wire preload + renderer source picker / Start–Stop.
- **Hasil:** `typecheck` + `build` + `lint` hijau.
- **Status:** done
- **Next:** Stream/capture frames dari source terpilih (getUserMedia / desktopCapturer) + temp file writer menuju ffmpeg.

## [2026-07-10 04:30] Bootstrap fondasi Electron + shell UI

- **Dikerjakan:** Buat `agent-memory/`; scaffold `electron/` (main, preload, `capture/macos.ts` stub), `shared/ipc.ts`; ganti loan-app renderer jadi Screen Flow shell; update package/scripts/tsconfig/README; hapus sumber loan-app.
- **Hasil:** typecheck + build + lint hijau. Commit `[agent] bootstrap Electron shell and Screen Flow UI`.
- **Status:** done
- **Next:** IPC `sources:list` via `desktopCapturer` + permission status probe; wire Start recording button ke stub session.

## [2026-07-10] (template)

- Belum ada entri sebelumnya — repo sebelumnya berisi loan journey React app.
