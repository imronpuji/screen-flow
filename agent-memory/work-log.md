# Screen Flow — Work Log

Entri terbaru di ATAS.

## [2026-07-10 06:15] Cursor smoothing + click ring preview

- **Dikerjakan:** `shared/cursorSmoothing.ts` (weighted smoothing, click ring animation); overlay kursor + ring di `AutoZoomPlayback` (stage aspect-ratio + zoom transform); toggle `cursorSmoothingEnabled` di review editor; smoke `smoke:cursor-smoothing`.
- **Hasil:** `typecheck` + `build` + `lint` + smoke cursor-smoothing/autozoom/export-trim hijau.
- **Status:** done (preview MVP)
- **Next:** Background padding/gradient preview; bake cursor + rings ke ffmpeg export.

## [2026-07-10 06:10] Bake trim ke ffmpeg MP4 export

- **Dikerjakan:** `shared/edit.ts` helpers (`normalizeTrim`, `applyTrimToCursorEvents`, `msToFfmpegSec`); IPC `ExportMp4Request.trim`; transcode `-ss/-to` + re-base cursor events untuk auto-zoom; UI kirim trim dari review sliders; smoke `smoke:export-trim`.
- **Hasil:** `typecheck` + `build` + `lint` + smoke trim/autozoom/progress hijau.
- **Status:** done
- **Next:** Cursor smoothing + click ring; background padding/gradient preview.

## [2026-07-10 06:05] Post-record Review & Edit UI + fix preview playback

- **Dikerjakan:** `screenflow-media://` custom protocol (fix file:// blocked dari http dev); mode `review` penuh dengan `RecordingReview` (preview besar, play/scrub, trim in/out, toggle auto-zoom); `AutoZoomPlayback` timeline + error states; `requestData()` sebelum MediaRecorder stop.
- **Hasil:** `typecheck` + `build` + `lint` hijau.
- **Status:** done
- **Next:** Bake trim ke ffmpeg export; cursor smoothing; background padding.

## [2026-07-10 05:58] Bake auto-zoom ke ffmpeg export

- **Dikerjakan:** `shared/ffmpegZoom.ts` (crop rect, sendcmd keyframes @ 30fps, filter plan); `electron/ffmpeg/probe.ts` (ffprobe dimensi/durasi); extend IPC `ExportMp4Request.autoZoom`; transcode spawn `sendcmd,crop@z,scale`; UI pass `cursorEventsPath` saat export; smoke `smoke:export-autozoom`.
- **Hasil:** `typecheck` + `build` + `lint` + semua smoke hijau (termasuk lavfi encode dengan sendcmd).
- **Status:** done (export MVP)
- **Next:** Cursor smoothing + click ring; background padding/gradient preview; timeline trim.

## [2026-07-10 05:46] Auto-zoom engine + playback preview

- **Dikerjakan:** `shared/autozoom.ts` (parse JSONL, build zoom segments, cubic easing); IPC `recording:read-cursor-events` + `recording:get-media-url`; komponen `AutoZoomPlayback` dengan CSS zoom pada klik; smoke `smoke:autozoom`.
- **Hasil:** `typecheck` + `build` + `lint` + smoke autozoom/cursor hijau.
- **Status:** done (preview MVP)
- **Next:** Cursor smoothing + click ring; background padding preview.

## [2026-07-10 05:05] Cursor event capture → JSONL

- **Dikerjakan:** `cursor-events.jsonl` per session via `uiohook-napi` (move/down/up/click) + fallback poll `screen.getCursorScreenPoint()`; types di `shared/cursor.ts`; throttle move; `StopRecordingResult.cursorEventsPath/count`; smoke `smoke:cursor-events`; UI summary menampilkan jumlah event.
- **Hasil:** `typecheck` + `build` + `lint` + smoke cursor/export hijau.
- **Status:** done
- **Next:** Auto-zoom engine baca JSONL + easing ke titik klik; atau background padding preview.

## [2026-07-10 05:00] Save As → Documents after export

- **Dikerjakan:** IPC `export:save` + `dialog.showSaveDialog` default `Documents/Screen Flow/ScreenFlow-….mp4`; copy temp MP4 keluar + cleanup session; path helpers murni + smoke `npm run smoke:export-save`; UI panggil Save As setelah encode sukses.
- **Hasil:** `typecheck` + `build` + `lint` + smoke save/progress hijau.
- **Status:** done
- **Next:** Cursor event capture (posisi + klik) untuk fondasi auto-zoom; atau background padding/rounded preview.

## [2026-07-10 04:55] Export progress IPC + cancel ffmpeg

- **Dikerjakan:** Parse ffmpeg `-progress` / Duration → `export:progress` push ke renderer; IPC `export:cancel` (SIGTERM child); UI Cancel + % status; smoke `npm run smoke:export-progress`.
- **Hasil:** `typecheck` + `build` + `lint` + smoke hijau.
- **Status:** done
- **Next:** Save-dialog ke Documents setelah export; atau cursor event capture untuk auto-zoom.

## [2026-07-10 04:50] ffmpeg WebM → MP4 export + temp cleanup

- **Dikerjakan:** Modul `electron/ffmpeg/transcode.ts` (spawn ffmpeg, VideoToolbox/libx264, path guard temp); IPC `export:webm-to-mp4`; preload + runtime bridge; tombol Export MP4 di UI setelah stop (cleanup WebM on success).
- **Hasil:** `typecheck` + `build` + `lint` hijau; smoke ffmpeg WebM→MP4 di Linux OK.
- **Status:** done
- **Next:** Progress/cancel export IPC; save-dialog ke Documents; atau mulai cursor event capture untuk auto-zoom.

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
