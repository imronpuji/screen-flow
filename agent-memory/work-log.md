# Screen Flow — Work Log

Entri terbaru di ATAS.
## [2026-07-10 09:15] Camera layout: corner resize handles (FOKUS 3B)

- **Dikerjakan:**
  - `shared/camera.ts` — `resizeCameraFromHandle` (NW/NE/SW/SE); opposite corner fixed; aspect lock (square); size 12–40%; result `anchor: 'free'`.
  - `CameraBubble` corner handles + pointer capture; CSS cursors; review hint updated.
  - Smoke `smoke:camera` covers grow/shrink/clamp.
- **Hasil:** `typecheck` + `build` + `lint` + smoke camera/export-camera/beautify/export-effects hijau.
- **Commit:** `4ec32ea`
- **Status:** done (FOKUS 3B slice — resize handles)
- **Next:** Rectangle shape; configurable border/shadow bake; drift compensation A/V.

## [2026-07-10 09:10] Camera layout: free drag + snap (FOKUS 3B)

- **Dikerjakan:**
  - `shared/camera.ts` — relative `x`/`y` (0–1 top-left), `anchor` corner|free, snap targets (4 corners + 4 edge mids), safe margin 3%, size 12–40%.
  - `CameraBubble` drag-and-drop (pointer capture) + snap on release; interactive CSS grab cursor.
  - Review: corner preset buttons + drag hint; setup live bubble also draggable; beautify uses `applyCameraCornerPreset`.
  - Smoke `smoke:camera` covers free layout, snap, presets.
- **Hasil:** `typecheck` + `build` + `lint` + smoke camera/export-camera/beautify/export-effects hijau.
- **Commit:** `30bb4b0`
- **Status:** done (FOKUS 3B slice — free position + snap)
- **Next:** Resize handles (aspect lock); rectangle shape; configurable border/shadow bake; drift compensation A/V.

## [2026-07-10 09:05] Per-click zoom points (manual edit)

- **Dikerjakan:**
  - `shared/zoomPoints.ts` — enable/disable + peak-scale overrides keyed by auto-segment index; apply/upsert helpers.
  - Review editor: zoom-point list (toggle + scale 1.1–3×); preview + export bake share `applyZoomPointOverrides`.
  - IPC/export: `ExportAutoZoomRequest.zoomOverrides` → `planAutoZoomExport` / transcode; Beautify preserves overrides.
  - Smoke `smoke:zoom-points`; remove “Per-click zoom points” from Coming next.
- **Hasil:** `typecheck` + `build` + `lint` + smoke zoom-points/autozoom/export-autozoom/beautify/timeline-markers/export-effects hijau.
- **Commit:** `7015792`
- **Status:** done (editor slice)
- **Next:** Visual verify Retina zoom on Mac; optional focus nudge / add-manual zoom at playhead.

## [2026-07-10 09:00] Timeline clip markers (editor)

- **Dikerjakan:**
  - `shared/timelineMarkers.ts` — zoom spans + click ticks + trim filter helpers.
  - Review scrubber: marker track (zoom bars / click ticks, click-to-seek) + trim shade.
  - Smoke `smoke:timeline-markers`; remove “Timeline clip markers” from Coming next.
- **Hasil:** `typecheck` + `build` + `lint` + smoke timeline-markers/tooltips/autozoom/shortcuts/beautify hijau.
- **Commit:** `b058897`
- **Status:** done (editor slice)
- **Next:** Per-click zoom points (manual edit); visual verify Retina zoom on Mac.

## [2026-07-10 08:56] Empty-state tooltips (polish)

- **Dikerjakan:**
  - `shared/tooltips.ts` — catalog + `startRecordingTooltip` / `sourcesEmptyTooltip` resolvers.
  - `Tooltip` + `EmptyHint` components; wire setup (Start/Refresh/camera/sources empty) + review (Export/Beautify/discard/no-camera).
  - Smoke `smoke:tooltips`; remove “Empty-state tooltips” from Coming next.
- **Hasil:** `typecheck` + `build` + `lint` + smoke tooltips/shortcuts/onboarding/beautify/camera/export-effects hijau.
- **Commit:** `a1e64b7`
- **Status:** done (polish slice 3)
- **Next:** Timeline clip markers; per-click zoom points; visual verify Retina zoom on Mac.

## [2026-07-10 08:20] Fix FaceTime double + export 234

- **Dikerjakan:**
  - Hide live FaceTime bubble while recording (badge only) so full-display capture does not burn camera into screen WebM → review shows one fixed `camera.webm` overlay.
  - Export: replace output `-to endMs` with `-t duration` after `-ss`; omit duration limit on full exports (EOF) to avoid VFR WebM overshoot → libx264 "Conversion failed!" / exit 234.
  - Harden `planCameraExport`: `fps=30`, `setsar=1`, `format=yuv420p` after overlay; `repeatlast=1`.
- **Hasil:** `typecheck` + `build` + `lint` + smoke camera/export-camera/export-effects/export-trim hijau.
- **Commit:** `2fe2c1e`
- **Status:** done
- **Next:** Empty-state tooltips; timeline markers; visual verify Retina zoom on Mac.

## [2026-07-10 08:10] Keyboard shortcuts (polish)

- **Dikerjakan:**
  - `shared/shortcuts.ts` — catalog + `matchShortcut` / `isEditableTarget` / scrub deltas (setup·recording·review·exporting).
  - Setup/recording: **R** / **Space** start-stop; **Esc** stop while recording (skip while onboarding).
  - Review: **Space** play/pause, **←/→** scrub (Shift=5s), **E** export, **B** Beautify, **Esc** discard / cancel export.
  - UI hints (`kbd`) + onboarding copy mentions shortcuts; smoke `smoke:shortcuts`.
- **Hasil:** `typecheck` + `build` + `lint` + smoke shortcuts/onboarding/beautify hijau.
- **Commit:** `73152d3`
- **Status:** done (polish slice 2)
- **Next:** Empty-state tooltips; timeline clip markers; visual verify Retina zoom on Mac.

## [2026-07-10 08:05] First-run onboarding + one-click Beautify

- **Dikerjakan:**
  - `shared/beautify.ts` — preset Tutorial / Product demo / Social (zoom+cursor+bg+quality+camera layout); `applyBeautifyPreset` preserve trim.
  - Review: tombol **Beautify** + picker 3 preset; Coming-next list di-update.
  - `OnboardingOverlay` 3 langkah (record → polish → export) + `localStorage` flag `screen-flow:onboarding-done`.
  - Smoke `smoke:beautify` + `smoke:onboarding`.
- **Hasil:** `typecheck` + `build` + `lint` + smokes hijau.
- **Commit:** `9bd025e`
- **Status:** done (polish slice 1)
- **Next:** Keyboard shortcuts; empty-state tooltips; timeline clip markers; visual verify Retina zoom on Mac.

## [2026-07-10 07:55] Fix FaceTime camera video + auto-zoom Retina/anti-jitter

- **Dikerjakan:**
  - **Kamera:** Electron `setPermissionRequestHandler` + macOS `askForMediaAccess('camera')` IPC; `CameraBubble` play/pause sync di review + live play kick; waiting state; ideal 720p constraints; cek live video track.
  - **FOKUS 1:** `shared/cursorCoords.ts` (DIP→frame); session tulis `capture-geometry.json`; anti-jitter merge/retarget di `buildZoomSegments`; preview+export pakai geometry.
- **Hasil:** `typecheck` + `build` + `lint` + smokes (autozoom/camera/cursor/export-*) hijau.
- **Commit:** `3e74e3e`
- **Status:** done
- **Next:** First-run onboarding / polish UX; one-click beautify; visual verify auto-zoom on Retina Mac.

## [2026-07-10 07:50] Export quality presets (Draft / Good / High)

- **Dikerjakan:** `shared/exportQuality.ts` (draft|good|high → VideoToolbox bitrate 4M/8M/16M + libx264 CRF/preset); IPC `ExportMp4Request.quality` + result; `transcode.pickVideoEncoder` + VT→x264 fallback ikut quality; `ReviewEditState.exportQuality` + picker di review; smoke `smoke:export-quality`.
- **Hasil:** `typecheck` + `build` + `lint` + smoke export-quality/camera/export-progress hijau.
- **Commit:** `0fb9ea9`
- **Status:** done (export quality MVP)
- **Next:** Auto-zoom Retina/anti-jitter polish (FOKUS 1); first-run onboarding / polish UX; one-click beautify.

## [2026-07-10 07:45] Camera bubble di review playback (FOKUS 3)

- **Dikerjakan:** `CameraBubble` support `mediaUrl` + `currentTimeSec` sync (ε 80ms) + `mirrored=false` untuk recorded; `AutoZoomPlayback` overlay di luar zoom (composite / full background canvas = urutan ffmpeg); `ReviewEditState.cameraOverlay` + kontrol corner/size/shape di review; App load `camera.webm` via `getMediaUrl`; export pakai `edit.cameraOverlay`; smoke `smoke:camera` cek `defaultReviewEdit` camera seed.
- **Hasil:** `typecheck` + `build` + `lint` + smoke camera/export-camera hijau.
- **Commit:** `075290a`
- **Status:** done (FOKUS 3 review playback)
- **Next:** Export quality presets; auto-zoom Retina/anti-jitter polish; first-run onboarding / polish UX.

## [2026-07-10 07:25] Cursor appearance: size / style / hide / spotlight (FOKUS 2)

- **Dikerjakan:** `shared/cursorAppearance.ts` (dot|crosshair|hidden, sizeScale 0.5–3, spotlight); preview di `AutoZoomPlayback` + kontrol review (style picker, size slider, spotlight); export bake di `ffmpegCursor` (scaled drawbox, crosshair arms, spotlight drawbox@spot, hidden → null); IPC `ExportMp4Request.cursorSmoothing.appearance`; smoke `smoke:cursor-appearance`.
- **Hasil:** `typecheck` + `build` + `lint` + smoke cursor-appearance/smoothing/export-effects hijau.
- **Commit:** `b95132c`
- **Status:** done (FOKUS 2 size/style/hide MVP)
- **Next:** Webcam FaceTime overlay (FOKUS 3) — enumerate + bubble preview + parallel camera.webm; atau auto-zoom Retina/anti-jitter polish; atau quality presets export.



## [2026-07-10 07:10] FaceTime camera overlay — enumerate + bubble + parallel camera.webm

- **Dikerjakan:** `shared/camera.ts` (corner/size/shape, CSS position + norm rect untuk ffmpeg nanti); `src/lib/cameraDevices.ts` (enumerate + getUserMedia + permission errors); `CameraBubble` live preview; session/IPC `track: screen|camera` + `includeCamera` → `camera.webm` sibling; UI toggle/device/corner/size/shape; smoke `smoke:camera`.
- **Hasil:** `typecheck` + `build` + `lint` + `smoke:camera` hijau. Sinkronisasi: screen & camera share `startedAt` wall-clock (belum ffmpeg overlay).
- **Commit:** `b1643f8`
- **Status:** done (FOKUS 3 slice 1)
- **Next:** Bake camera overlay ke ffmpeg export (overlay filter + norm rect); playback camera di review; atau cursor size/style/hide (FOKUS 2).

## [2026-07-10 07:20] Bake FaceTime camera bubble ke ffmpeg export

- **Dikerjakan:** Cherry-pick FOKUS 3 slice 1 dari `54c7`; `shared/ffmpegCamera.ts` (scale/crop + 1-frame circle/rounded mask + overlay); `planExportFilters` urutan zoom→bg→cursor→camera; IPC `ExportMp4Request.camera`; transcode input kedua `camera.webm` + trim `-ss` selaras; UI `lastCameraPath` → export; smoke `smoke:export-camera` (plan + lavfi encode).
- **Hasil:** `typecheck` + `build` + `lint` + smoke camera/export-camera/export-effects hijau.
- **Commit:** `1fb2e0e` (plus cherry-picks `4b110fd`/`325bedd`)
- **Status:** done (FOKUS 3 slice 2 — export bake)
- **Next:** Camera bubble di review playback; cursor size/style/hide (FOKUS 2); polish auto-zoom Retina/anti-jitter; quality presets export.

## [2026-07-10 07:10] FaceTime camera overlay — enumerate + bubble + parallel camera.webm

- **Dikerjakan:** `shared/camera.ts` (corner/size/shape, CSS position + norm rect untuk ffmpeg nanti); `src/lib/cameraDevices.ts` (enumerate + getUserMedia + permission errors); `CameraBubble` live preview; session/IPC `track: screen|camera` + `includeCamera` → `camera.webm` sibling; UI toggle/device/corner/size/shape; smoke `smoke:camera`.
- **Hasil:** `typecheck` + `build` + `lint` + `smoke:camera` hijau. Sinkronisasi: screen & camera share `startedAt` wall-clock (belum ffmpeg overlay).
- **Commit:** `b1643f8` / cherry-pick `4b110fd`
- **Status:** done (FOKUS 3 slice 1)
- **Next:** Bake camera overlay ke ffmpeg export (overlay filter + norm rect); playback camera di review; atau cursor size/style/hide (FOKUS 2).

## [2026-07-10 07:02] Fast rounded corners + soft shadow di export (1-frame mask)

- **Dikerjakan:** `shared/ffmpegBackground.ts` — path rounded/shadow pakai `color` 1-frame → `geq` alpha rounded-rect → `loop` → `alphamerge` pada card; soft shadow = still hitam rounded + `boxblur` sekali lalu loop + overlay. Plain path (radius 0, shadow off) tetap gradient+scale+overlay. Smoke `smoke:export-effects` cek alphamerge/loop/boxblur dan pastikan geq tidak jalan di input video.
- **Hasil:** `typecheck` + `build:electron` + `lint` + smoke export-effects/background hijau. Encode 720p 3s ~0.75s (~4× realtime) vs sebelumnya ~26s + card hilang.
- **Commit:** `58d4194`
- **Status:** done
- **Next:** Webcam FaceTime overlay (FOKUS 3) — enumerate kamera + bubble preview; atau cursor size/style controls (FOKUS 2); cek alignment titik cursor drawbox vs kursor asli.

## [2026-07-10 13:50] Fix export background lambat + card hilang (buang geq/boxblur)

- **Gejala:** Export dengan background aktif → sangat lambat (~26s untuk klip 3 detik / ~2 menit untuk 15s) dan hasil MP4 cuma ~600 KB. Frame ternyata: card rekaman HILANG, cuma tersisa gradient + 4 artefak lingkaran di pojok + titik cursor.
- **Akar masalah:** `planBackgroundExport` (`shared/ffmpegBackground.ts`) pakai `geq` (rounded corner, evaluasi per-piksel) + `boxblur` (shadow). Dua-duanya ~10× lebih lambat dari `scale` di resolusi penuh 2560×1600. Parah lagi: `geq=lum='p(X,Y)':cb=…:cr=…` di input rgba SALAH model warna → isi card kehapus, cuma nyisain mask pojok. Output nyaris kosong → sangat kompresibel (600 KB).
- **Dikerjakan:** Rewrite `planBackgroundExport` ke jalur cepat saja: `gradients` + `scale` card + `overlay` padding. Buang rounded-corner (geq) & shadow (boxblur). Konfirmasi via repro di capture asli: 26.3s→1.2s (~22×) dan card muncul utuh di frame.
- **Hasil:** `build:electron` + `typecheck` + `smoke:export-effects` (termasuk composite encode) hijau. App relaunch.
- **Status:** done
- **Next:** Rounded corner + shadow versi cepat & benar via alpha-mask sekali-render (bukan geq per-frame) untuk match preview CSS; cek posisi titik cursor overlay (drawbox) yang tampak meleset dari kursor asli.

## [2026-07-10 13:40] Fix export gagal "No such filter: ''" (koma sebelum label output cursor)

- **Gejala:** Export MP4 dengan cursor effect aktif → `ffmpeg exited with code 8: No such filter: '' — Filter not found`.
- **Akar masalah:** `planCursorExport` (`shared/ffmpegCursor.ts`) merakit filter_complex tail dengan `[...filters, '[vout]'].join(',')`, menghasilkan `...drawbox@ring=...,[vout]`. Koma sebelum `[vout]` bikin ffmpeg menganggap ada filter kosong setelah drawbox → parse error. Label pad output harus nempel ke filter terakhir TANPA koma.
- **Dikerjakan:** `shared/ffmpegCursor.ts` — rakit ulang jadi `[in]` + `filters.join(',')` + `[out]` (tanpa koma di depan `[out]`). `scripts/smoke-export-effects.mts` — tambah `testFfmpegCompositeEncode` yang beneran nge-encode graf lengkap (zoom+background+cursor) via ffmpeg (celah lama: smoke cuma nge-encode graf background-only, jadi bug cursor lolos).
- **Hasil:** `build:electron` hijau; `smoke:export-effects` hijau termasuk "ok ffmpeg composite encode"; koma-sebelum-label dikonfirmasi sebagai penyebab via tes lavfi mandiri. App di-relaunch.
- **Status:** done
- **Next:** Review screen (playback hasil + reveal in Finder) yang sempat ketunda; pertimbangkan pass durasi rekaman sebagai hint ke probe.

## [2026-07-10 06:25] Bake background + cursor smoothing ke ffmpeg export

- **Dikerjakan:** `shared/ffmpegBackground.ts` (gradients + padding card + rounded geq + shadow boxblur); `shared/ffmpegCursor.ts` (smoothed cursor + click ring via sendcmd/drawbox); `shared/ffmpegExport.ts` orchestrator; extend IPC `ExportMp4Request.background` + `cursorSmoothing`; `transcode.ts` filter_complex path; UI export kirim review toggles; smoke `smoke:export-effects`.
- **Hasil:** `typecheck` + `build` + `lint` + smoke export-effects/autozoom/background/cursor-smoothing hijau.
- **Status:** done (export MVP)
- **Next:** Export GIF/WebM; one-click beautify preset; per-click zoom points di timeline.

## [2026-07-10 06:20] Background padding + gradient preview

- **Dikerjakan:** `shared/background.ts` (5 preset gradient, padding %, corner radius, shadow); extend `ReviewEditState.background`; frame kartu di `AutoZoomPlayback` (gradient + padding + rounded + shadow); kontrol review (toggle, preset picker, padding slider, shadow); smoke `smoke:background`.
- **Hasil:** `typecheck` + `build` + `lint` + smoke background/cursor-smoothing hijau.
- **Status:** done (preview MVP)
- **Next:** Bake background + cursor smoothing ke ffmpeg export; polish preset gaya (Tutorial/Demo).

## [2026-07-10 06:15] Cursor smoothing + click ring preview

- **Dikerjakan:** `shared/cursorSmoothing.ts` (weighted smoothing, click ring animation); overlay kursor + ring di `AutoZoomPlayback` (stage aspect-ratio + zoom transform); toggle `cursorSmoothingEnabled` di review editor; smoke `smoke:cursor-smoothing`.
- **Hasil:** `typecheck` + `build` + `lint` + smoke cursor-smoothing/autozoom/export-trim hijau.
- **Status:** done (preview MVP)
- **Next:** Background padding/gradient preview; bake cursor + rings ke ffmpeg export.

## [2026-07-10 13:17] Fix export gagal "ffprobe could not read video duration" + preload jatuh ke browser fallback

- **Gejala:** Export MP4 error `ffprobe could not read video duration`; auto-zoom nggak jalan (auto-zoom di-bake pas encode, jadi ikut gagal). Sebelumnya jendela Electron juga tampil "browser preview / Electron capture APIs unavailable".
- **Akar masalah:** (1) WebM dari `MediaRecorder` ditulis streaming — header tak punya `format.duration` maupun stream `duration`, jadi ffprobe balikin kosong → `probeVideoFile` hard-fail → export batal. (2) `webPreferences.sandbox` sempat `true`; preload pakai ESM import lokal (`../shared/ipc.js`) yang tak jalan di sandbox → `window.screenFlow` tak ter-inject.
- **Dikerjakan:** `electron/ffmpeg/probe.ts` — tambah fallback `probeDurationByPackets` (scan `packet=pts_time,duration_time`, ambil pts terakhir + 1 frame) saat container/stream duration kosong; juga baca `stream=duration` sebagai lapis kedua. `electron/main.ts` — balikin `sandbox: false`.
- **Hasil:** `build:electron` hijau; probe di file capture asli balikin durasi 15.156s (sebelumnya error); `smoke:export-autozoom` hijau. App di-relaunch dengan build baru.
- **Status:** done
- **Next:** Pertimbangkan kirim durasi rekaman (wall-clock `StopRecordingResult.durationMs`) sebagai hint ke export biar tak selalu bergantung scan packet; lanjut review screen (playback hasil + reveal in Finder) yang sempat ketunda.


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
