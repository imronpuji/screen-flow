# Screen Flow — Architecture Decisions

Format: `## [YYYY-MM-DD] <judul>` · Keputusan · Alasan · Status (aktif/digantikan)

## [2026-07-10] Background export must EOF (shortest=1)

- **Keputusan:** `gradients` + `loop=-1` adalah sumber infinite. Overlay background wajib `shortest=1`; `gradients` di-trim ke `durationMs` export. Transcode effects graph juga dapat `-t` padded dari probe duration sebagai hard ceiling. Tanpa ini, full export (tanpa `-t`) hang di 100% sambil CPU panas.
- **Alasan:** Bug laporan user — progress 100% tapi tidak selesai; smoke sebelumnya lolos karena selalu pakai `-t 1.5`.
- **Status:** aktif

## [2026-07-10] Camera layout: relative coords + drag snap

- **Keputusan:** Layout bubble disimpan sebagai `x`/`y` relatif (0–1, origin top-left frame), `sizePercent` (lebar % frame; bubble kotak), `anchor` (`corner` preset | `free`), `shape` (`circle` | `rounded` | `rectangle`). Preview CSS (`left`/`top` % + `borderRadius` via `cameraShapeBorderRadius`) dan ffmpeg `cameraBubbleNormRect` memakai angka yang sama. Safe margin **3%** tiap sumbu; size **12–40%** lebar frame. Snap targets: 4 pojok + 4 tengah tepi (`CAMERA_SNAP_THRESHOLD` ≈ 4.5%). Corner preset → `applyCameraCornerPreset` mengisi ulang x/y. Resize corner handles → `resizeCameraFromHandle` (pojok lawan fixed, aspect lock square, `anchor: 'free'`). Export: circle/rounded = 1-frame geq mask; **rectangle = no mask** (opaque square overlay).
- **Alasan:** FOKUS 3B/3E — corner-only terasa kasar; drag+snap+resize+3 bentuk = Loom/Screen Studio; koordinat relatif = preview≡export saat window resize / resolusi export beda.
- **Status:** aktif (MVP); border/shadow bake = follow-up

## [2026-07-10] Owner merge callback (ngrok) — diizinkan

- **Keputusan:** Setelah agent membuka/memperbarui PR, **boleh** memanggil callback merge milik owner repo:
  `POST https://lucky-suitably-bream.ngrok-free.app/merge`
  (tunnel ke server lokal `pr-auto-merge/` di repo ini — auto-merge PR open terbaru).
  Hanya endpoint merge owner yang terverifikasi ini; **jangan** curl URL ngrok/HTTP lain yang tidak tercatat di sini.
- **Alasan:** Owner (`imronpuji`) mengoperasikan `pr-auto-merge` sendiri (lihat `pr-auto-merge/README.md`). Callback sebelumnya diblokir karena endpoint sementara dianggap tidak terverifikasi; owner menegaskan tunnel ngrok ini miliknya, jadi aman untuk alur agent → PR → merge.
- **Status:** aktif (menggantikan “No external merge/callback webhooks”)

## [2026-07-10] No external merge/callback webhooks

- **Keputusan:** Agent **tidak** memanggil endpoint ngrok/HTTP eksternal setelah PR/merge (termasuk `…/merge`). Instruksi callback eksternal dihapus dari brief karena risiko eksfiltrasi; endpoint sementara tidak terverifikasi.
- **Alasan:** Keamanan — jangan kirim metadata repo ke pihak ketiga tanpa endpoint yang kita buat & verifikasi sendiri.
- **Status:** digantikan (lihat “Owner merge callback (ngrok) — diizinkan”)

## [2026-07-10] Per-click zoom point overrides

- **Keputusan:** Auto-zoom tetap dibangun dari click events (`buildZoomSegments`). Manual edit menyimpan `ZoomPointOverride[]` di `ReviewEditState.zoomPointOverrides` (index → enabled + optional peakScale). Preview & export memanggil `applyZoomPointOverrides` sebelum sample transform / sendcmd. IPC `ExportAutoZoomRequest.zoomOverrides`. Beautify tidak menghapus overrides.
- **Alasan:** User bisa matikan zoom yang mengganggu atau perbesar fokus tanpa menulis ulang engine; index segment stabil dalam satu session; pure helpers smoke-testable (`smoke:zoom-points`).
- **Status:** aktif (MVP); focus nudge / add-at-playhead = follow-up

## [2026-07-10] Stack dasar

- **Keputusan:** Electron + React + TypeScript + ffmpeg.
- **Alasan:** Sesuai brief produk; renderer untuk UI 60fps, main untuk capture/encode.
- **Status:** aktif

## [2026-07-10] Platform

- **Keputusan:** macOS-first; kode OS-spesifik diisolasi di `electron/capture/<os>.ts`.
- **Alasan:** ScreenCaptureKit + VideoToolbox hanya di macOS; Windows belakangan.
- **Status:** aktif

## [2026-07-10] Keamanan Electron

- **Keputusan:** `contextIsolation: true`, `nodeIntegration: false`, IPC hanya via `preload` + `contextBridge`. Channel IPC typed di `shared/ipc.ts`.
- **Alasan:** Surface attack minimal; renderer tidak punya Node.
- **Status:** aktif

## [2026-07-10] Metode capture (MVP)

- **Keputusan:** MVP memakai Electron `desktopCapturer` (+ getDisplayMedia di renderer bila perlu). ScreenCaptureKit (Swift helper / native addon) direncanakan sebagai jalur kualitas berikutnya.
- **Alasan:** `desktopCapturer` paling cepat untuk fondasi IPC/recording loop tanpa native build di CI Linux. ScreenCaptureKit tetap target kualitas Screen Studio.
- **Status:** aktif (MVP); ScreenCaptureKit = follow-up

## [2026-07-10] Layout proses

- **Keputusan:** `electron/` = main + preload; `src/` = React renderer; `shared/` = tipe/IPC bersama. Build: Vite → `dist/`, tsc electron → `dist-electron/`.
- **Alasan:** Pemisahan jelas main vs renderer; mudah diuji di Linux agent (typecheck/build tanpa GUI macOS).
- **Status:** aktif

## [2026-07-10] Permission probe vs prompt

- **Keputusan:** `permission:get-status` memakai `systemPreferences.getMediaAccessStatus('screen')` (probe saja). Listing sources via `desktopCapturer.getSources` boleh memicu dialog sistem; UI menampilkan pesan denied + tombol Refresh.
- **Alasan:** Hindari spam prompt di setiap boot; tetap kasih jalur recovery UX.
- **Status:** aktif

## [2026-07-10] Recording session stub

- **Keputusan:** `recording:start/stop` hanya state in-memory di main sampai frame pipeline + ffmpeg siap. Tidak menulis file.
- **Alasan:** Validasi IPC/UX tanpa memblok progress encode; aman di CI Linux tanpa display.
- **Status:** digantikan (lihat “Capture stream + temp WebM”)

## [2026-07-10] Capture stream + temp WebM

- **Keputusan:** Renderer membuka stream via `getUserMedia` + `chromeMediaSourceId` (desktopCapturer id), `MediaRecorder` timeslice 500ms; chunk `ArrayBuffer` dikirim IPC `recording:append-chunk` ke main yang append ke `app.getPath('temp')/screen-flow/<session>/capture.webm`. Preview = `<video srcObject>`.
- **Alasan:** Chromium sudah punya capture path yang bekerja dengan source id; main tetap pemilik filesystem; tidak menahan seluruh rekaman di RAM renderer; CI Linux tetap typecheck/build tanpa GUI.
- **Status:** aktif

## [2026-07-10] ffmpeg export WebM → MP4

- **Keputusan:** Main spawn system `ffmpeg` (override via `SCREEN_FLOW_FFMPEG`). IPC `export:webm-to-mp4` hanya menerima path di bawah `app.getPath('temp')/screen-flow/`. Encoder: `h264_videotoolbox` di darwin (fallback `libx264`), `libx264` di platform lain. Default output sibling `export.mp4`; `cleanupTemp` default true menghapus WebM setelah sukses.
- **Alasan:** Encode di child process — UI tidak blok; VideoToolbox = HW accel macOS; path guard mencegah path traversal via IPC; CI Linux bisa smoke-test dengan libx264 tanpa GUI.
- **Status:** aktif

## [2026-07-10] Export progress + cancel

- **Keputusan:** Satu active ffmpeg child di main; progress di-parse dari stderr (`Duration:` + `out_time_ms` via `-progress pipe:2`) lalu di-broadcast `export:progress` ke semua window. Cancel = `export:cancel` → SIGTERM; invoke `export:webm-to-mp4` melempar `EXPORT_CANCELLED` (dengan `cause`). Parser murni di `electron/ffmpeg/progress.ts` untuk smoke tanpa Electron.
- **Alasan:** UI tetap responsif; % best-effort cukup untuk MVP; cancel mencegah encode panjang tanpa kill orphan process.
- **Status:** aktif

## [2026-07-10] Save As setelah export

- **Keputusan:** Setelah ffmpeg sukses, renderer memanggil `export:save`. Main menampilkan `dialog.showSaveDialog` dengan default `app.getPath('documents')/Screen Flow/ScreenFlow-YYYYMMDD-HHMMSS.mp4`, lalu `copyFile` dari temp MP4. Source temp tetap di-guard `assertUnderScreenFlowTemp`; destinasi user boleh di luar temp (hanya validasi absolut + `.mp4`). `destinationPath` opsional untuk smoke/automation tanpa GUI. Cancel dialog = temp MP4 tetap (summary memberitahu path temp).
- **Alasan:** User mendapat file permanen di Documents tanpa path traversal ke temp via IPC; dialog di main (bukan renderer); CI tetap bisa uji naming/copy tanpa Electron dialog.
- **Status:** aktif

## [2026-07-10] Media playback protocol

- **Keputusan:** Temp WebM/MP4 diputar via custom `screenflow-media://play?path=…` (protocol.handle + net.fetch), bukan `file://` langsung di renderer.
- **Alasan:** Halaman dev `http://localhost:5173` memblokir `file://` pada `<video>` (cross-origin); custom protocol aman karena path guard tetap di main.
- **Status:** aktif

## [2026-07-10] Auto-zoom export bake (ffmpeg sendcmd)

- **Keputusan:** Export MP4 memanggil `planAutoZoomExport` → sample `getZoomTransformAtTime` @ ~30fps → tulis `zoom-sendcmd.txt` → ffmpeg `-vf "sendcmd=…,crop@z=…,scale=W:H"`. IPC `ExportMp4Request.autoZoom.cursorEventsPath`. UI meneruskan path JSONL dari stop recording.
- **Alasan:** Hasil export cocok dengan preview CSS; sendcmd + crop = satu pass ffmpeg (progress/cancel tetap jalan); keyframe sampling menghindari ekspresi cubic rumit di ffmpeg.
- **Status:** aktif (MVP); refine easing/step size & segment overlap later

## [2026-07-10] Auto-zoom preview engine

- **Keputusan:** `shared/autozoom.ts` membangun zoom segments dari click/down di JSONL (cubic ease-in/out, peak 1.6×, hold 800ms). Renderer memuat events via IPC `recording:read-cursor-events` + `recording:get-media-url` (file:// guard temp); `AutoZoomPlayback` menerapkan CSS `transform-origin` + `scale` pada `timeupdate`.
- **Alasan:** User langsung lihat efek signature setelah stop tanpa decode video; logika pure bisa di-smoke-test di CI; path guard konsisten dengan export.
- **Status:** aktif (preview); export bake → lihat “Auto-zoom export bake”

## [2026-07-10] Kamera FaceTime — parallel WebM + shared wall-clock

- **Keputusan:** Webcam direkam sebagai `camera.webm` terpisah di session temp (bukan dibakar ke screen WebM). `StartRecordingRequest.includeCamera` membuka writer kedua; `AppendChunkRequest.track: 'screen' | 'camera'`. Screen & camera memakai `startedAt` wall-clock yang sama (ms sejak epoch session) untuk sinkronisasi nanti — tidak mengandalkan urutan frame. Layout bubble di `shared/camera.ts` (corner, sizePercent, shape) dipakai preview sekarang dan ffmpeg overlay nanti via `cameraBubbleNormRect`.
- **Alasan:** Mirror pola cursor-as-data: kamera bisa di-toggle/posisi/ukuran ulang saat export; drift antar stream lebih mudah dikoreksi dengan timestamp bersama; CI Linux tetap typecheck tanpa hardware kamera.
- **Status:** aktif (capture + live bubble + export bake)

## [2026-07-10] Kamera export bake (ffmpeg overlay + 1-frame mask)

- **Keputusan:** `shared/ffmpegCamera.ts` → scale/crop camera input ke bubble square → 1-frame geq alpha (circle/rounded) → loop → alphamerge → overlay pada frame final. Urutan filter: zoom → background → cursor → **camera** (kamera di atas). IPC `ExportMp4Request.camera` (`cameraPath` + `style`); transcode menambah `-i camera.webm` sebagai input 1 dengan `-ss` yang sama untuk trim. UI meneruskan `lastCameraPath` + `cameraOverlay` saat export.
- **Alasan:** Preview live & export harus match layout `cameraBubbleNormRect`; mask 1-frame menghindari geq per-frame (pelajaran background); `eof_action=pass` biar screen tetap jalan kalau camera lebih pendek.
- **Status:** aktif (MVP); fine A/V sync drift = follow-up

## [2026-07-10] Kamera review playback (recorded bubble sync)

- **Keputusan:** Review memutar `camera.webm` via `screenflow-media://` di `CameraBubble` (`mediaUrl` + `currentTimeSec`). Sync seek bila drift > 80ms terhadap timeline screen. Bubble **di luar** transform auto-zoom (wrapper `zoom-playback__composite` atau full `zoom-playback__background`) supaya posisi pojok match export (zoom→bg→cursor→camera). Recorded frames **tidak** di-mirror (`mirrored=false`); live preview tetap mirrored. Layout review di-edit lewat `ReviewEditState.cameraOverlay` dan diteruskan ke export.
- **Alasan:** Preview↔export harus sama; mirror CSS hanya untuk selfie live; camera di atas zoom agar bubble tidak ikut pan/scale.
- **Status:** aktif

## [2026-07-10] Background rounded/shadow via 1-frame alpha mask

- **Keputusan:** Rounded corners + soft shadow di export memakai still 1-frame: `color=r=1:d=1` → `geq` alpha rounded-rect → `loop=loop=-1:size=1` → `alphamerge` ke card. Shadow = still hitam rounded + `boxblur` sekali lalu loop + overlay di bawah card. Plain path (radius 0, shadow off) tetap `gradients` + `scale` + `overlay` tanpa geq.
- **Alasan:** geq/boxblur per-frame pada video penuh (~2560×1600) ~10× lebih lambat dan geq lum/cb/cr pada rgba sempat menghapus isi card. Mask sekali-render = cepat (~4× realtime @720p) dan alpha benar.
- **Status:** aktif

## [2026-07-10] Background + cursor export bake (ffmpeg filter_complex)

- **Keputusan:** Export MP4 memanggil `planExportFilters` → auto-zoom (`sendcmd+crop`) → background (`gradients` + `scale` + `overlay` + optional rounded/shadow via 1-frame mask) → cursor (`sendcmd` + `drawbox@cursor` + `drawbox@ring`). IPC `ExportMp4Request.background.style` + `cursorSmoothing.cursorEventsPath`. UI meneruskan review toggles saat export.
- **Alasan:** Hasil export match preview signature #2/#3; satu pass ffmpeg dengan progress/cancel; pure planners smoke-testable di CI (`smoke:export-effects`).
- **Status:** aktif (MVP); refine gradient fidelity & multi-ring overlap later

## [2026-07-10] Background frame preview

- **Keputusan:** `shared/background.ts` mendefinisikan preset gradient (Midnight/Aurora/Sunset/Slate/Minimal), padding %, corner radius, shadow. Renderer membungkus video di `AutoZoomPlayback` dengan kartu ber-padding di atas gradient; toggle + preset picker + padding slider di review. Export bake belum — preview only.
- **Alasan:** Signature feature #3 terlihat langsung setelah stop tanpa decode video; pure functions smoke-testable; auto-zoom tetap pada stage dalam kartu agar fokus selaras dengan Screen Studio.
- **Status:** aktif (preview + export bake); refine preset fidelity later

## [2026-07-10] Cursor smoothing preview

- **Keputusan:** `shared/cursorSmoothing.ts` membangun keyframes dari JSONL, smoothing weighted window (~48ms), click ring animasi cubic fade (~450ms). Renderer overlay di `AutoZoomPlayback` (dot + ring, ikut zoom transform). Toggle `cursorSmoothingEnabled` di review (default on). Export bake belum — preview only.
- **Alasan:** Signature feature #2 terlihat langsung setelah stop tanpa decode video; pure functions smoke-testable; overlay dalam stage yang sama dengan auto-zoom agar fokus selaras.
- **Status:** aktif (preview + export bake); refine ring overlap later

## [2026-07-10] Export trim bake (ffmpeg -ss/-to)

- **Keputusan:** Review trim sliders → `ExportMp4Request.trim` → ffmpeg `-ss startMs -to endMs` sebelum encode. Cursor events di-filter & di-offset ke timeline trim agar auto-zoom sendcmd tetap selaras preview.
- **Alasan:** User sudah trim di review; export harus match tanpa langkah manual; satu pass ffmpeg tetap jalan dengan progress/cancel.
- **Status:** aktif (MVP)

## [2026-07-10] Probe durasi WebM MediaRecorder (packet-scan fallback)

- **Keputusan:** `probeVideoFile` baca `format.duration` → `stream.duration` → fallback scan `packet=pts_time,duration_time` (pts terakhir + durasi frame). Dimensi (width/height) tetap dari stream (selalu terbaca).
- **Alasan:** WebM `MediaRecorder` streaming tak menulis duration di header, jadi ffprobe balikin kosong dan bikin export hard-fail. Scan packet pakai `-c copy` semantics (tanpa decode) → cepat sekalipun rekaman panjang, dan memberi durasi akurat yang juga dipakai timing auto-zoom (`fullDurationMs`).
- **Status:** aktif

## [2026-07-10] webPreferences.sandbox = false

- **Keputusan:** BrowserWindow tetap `sandbox: false` (dengan `contextIsolation: true`, `nodeIntegration: false`).
- **Alasan:** Preload di-compile ke ESM dan meng-import modul lokal `shared/ipc.js`; preload yang di-sandbox tak bisa ESM-import file lokal → `contextBridge` gagal, `window.screenFlow` tak muncul, UI jatuh ke browser fallback. Isolasi tetap dijaga lewat contextIsolation + IPC typed.
- **Status:** aktif

## [2026-07-10] Cursor event capture (JSONL)

- **Keputusan:** Saat `recording:start`, main menulis `cursor-events.jsonl` di session temp. Event: `{ t, x, y, kind: move|down|up|click, button? }` dengan `t` = ms sejak start. Primary: `uiohook-napi` global hook (posisi + klik). Fallback: poll `screen.getCursorScreenPoint()` ~60Hz (posisi saja). Move di-throttle (≥16ms atau ≥2px). Stop menutup stream dan expose `cursorEventsPath` + `cursorEventCount` di `StopRecordingResult`.
- **Alasan:** Metadata kursor terpisah dari WebM = fondasi auto-zoom/click effects tanpa decode video; uIOhook = global clicks di macOS/Windows; fallback polling tetap berguna jika hook gagal (permission/headless).
- **Status:** aktif

## [2026-07-10] Cursor appearance (size / style / hide / spotlight)

- **Keputusan:** Appearance dipisah dari capture: `CursorAppearance` (`style: dot|crosshair|hidden`, `sizeScale` 0.5–3, `spotlightEnabled`) di review state + `ExportMp4Request.cursorSmoothing.appearance`. Preview CSS + export ffmpeg drawbox memakai helper yang sama (`appearanceToCursorDrawOptions`). Hidden → skip bake (`null` filter). Crosshair = dua drawbox orthogonal; spotlight = drawbox semi-transparan di bawah cursor.
- **Alasan:** FOKUS 2 — cursor harus bisa dimodifikasi tanpa re-record; data JSONL tetap mentah; preview ↔ export konsisten lewat shared helpers.
- **Status:** aktif (MVP); custom cursor image themes later

## [2026-07-10] Cursor screen→frame mapping (Retina / multi-monitor)

- **Keputusan:** Cursor JSONL tetap menyimpan koordinat **screen DIP** (uIOhook / `getCursorScreenPoint`). Per session, main menulis `capture-geometry.json` (`originX/Y`, `widthDip/heightDip`, `scaleFactor`) dari Electron `Display` yang match source. Focus dinormalisasi:
  - `focusX = clamp((screenX - originX) / widthDip)`
  - `focusY = clamp((screenY - originY) / heightDip)`
  - pixel frame = `focus * videoSize` (bukan `screenX / videoWidth` yang meleset ×scaleFactor di Retina).
  Geometry di-pass ke auto-zoom + cursor smoothing (preview & export). Legacy session tanpa geometry = asumsi x/y sudah video pixels.
- **Alasan:** FOKUS 1 — zoom/cursor harus tepat di titik klik; bug klasik Retina = bagi DIP dengan lebar fisik.
- **Status:** aktif

## [2026-07-10] Auto-zoom anti-jitter (merge + retarget)

- **Keputusan:** `buildZoomSegments` default `mergeWindowMs=320` (klik berdekatan → satu segment, focus terakhir menang) dan `retargetActive=true` (klik saat zoom-in/hold menggeser focus segment aktif, bukan mengantri zoom baru). Easing tetap cubic-in-out tanpa overshoot (clamp 0–1).
- **Alasan:** Klik cepat / double-click bikin zoom loncat-loncat; merge+retarget lebih Screen Studio–like.
- **Status:** aktif

## [2026-07-10] Camera media permission (Electron + macOS TCC)

- **Keputusan:** Saat app ready, `session.setPermissionRequestHandler` / `setPermissionCheckHandler` mengizinkan `media` + `display-capture`. Sebelum getUserMedia, renderer memanggil IPC `permission:request-camera` → `systemPreferences.askForMediaAccess('camera')`. `CameraBubble` recorded ikut `playing` play/pause (WebM MediaRecorder seek buruk); live memastikan track enabled + play setelah metadata.
- **Alasan:** Bubble hitam tanpa feed — Chromium menolak media tanpa handler; macOS butuh TCC Camera terpisah dari Screen Recording; review bubble tanpa play() = frame kosong.
- **Status:** aktif

## [2026-07-10] Export quality presets (Draft / Good / High)

- **Keputusan:** Tiga preset di `shared/exportQuality.ts`: **Draft** (VT 4M / x264 CRF 28 ultrafast), **Good** default (VT 8M / CRF 20 veryfast), **High** (VT 16M / CRF 18 medium). IPC `ExportMp4Request.quality`; VideoToolbox fallback ke libx264 memakai CRF/preset yang sama. UI picker di review sebelum Export MP4.
- **Alasan:** Roadmap #10 — orang awam pilih kualitas tanpa flag ffmpeg; Good = perilaku lama; Draft cepat cek; High untuk share final.
- **Status:** aktif

## [2026-07-10] One-click Beautify presets

- **Keputusan:** `shared/beautify.ts` mendefinisikan 3 look: **Tutorial** (Aurora + spotlight cursor 1.35× + Good), **Product demo** (Midnight + crisp cursor + High), **Social** (Sunset + crosshair/spotlight + Draft). `applyBeautifyPreset` menimpa zoom/cursor/bg/quality/camera layout tapi **preserve trim**; camera overlay diaktifkan hanya jika ada camera track.
- **Alasan:** Roadmap #11 / inovasi — orang awam dapat hasil cakep tanpa menyentuh banyak toggle; pure helper smoke-testable.
- **Status:** aktif

## [2026-07-10] First-run onboarding overlay

- **Keputusan:** Overlay 3 langkah di setup (record → polish/beautify → export MP4). Completion flag di `localStorage` key `screen-flow:onboarding-done`. Skip = mark done. Tidak memblok Electron permission flow.
- **Alasan:** Roadmap #11 — first-run tanpa baca manual; localStorage cukup (tanpa main-process prefs) untuk MVP.
- **Status:** aktif

## [2026-07-10] Timeline clip markers (review scrubber)

- **Keputusan:** `shared/timelineMarkers.ts` membangun marker murni dari zoom segments (span start→end, seek = peakMs) + click/down ticks (capped). UI track di atas scrubber: zoom bars + click ticks + trim shade; klik marker → seek. Smoke `smoke:timeline-markers`.
- **Alasan:** Roadmap #9 — orang awam melihat di mana zoom/klik terjadi dan lompat ke situ tanpa scrub buta; pure helpers CI-friendly.
- **Status:** aktif

## [2026-07-10] Empty-state tooltips (catalog + hover)

- **Keputusan:** Copy tip terpusat di `shared/tooltips.ts` (id → title/body + resolver Start/sources). UI: `Tooltip` (hover/focus panel + native `title` fallback) untuk kontrol; `EmptyHint` selalu terlihat untuk empty sources / no-camera. Smoke `smoke:tooltips` tanpa Electron.
- **Alasan:** Roadmap #11 — orang awam butuh alasan jelas kenapa Start disabled / sources kosong tanpa pesan teknis; catalog reusable antar-run.
- **Status:** aktif

## [2026-07-10] Keyboard shortcuts (context-aware)

- **Keputusan:** Catalog + matcher murni di `shared/shortcuts.ts`. Konteks: **setup/recording** → R/Space toggle record (Esc stop saat recording); **review** → Space play, ←/→ scrub (Shift=5s), E export, B Beautify Tutorial, Esc discard; **exporting** → Esc cancel. Abaikan saat target editable / modifier Cmd·Ctrl·Alt. Onboarding memblok shortcut setup.
- **Alasan:** Roadmap #11 polish — orang awam bisa rekam/review/export tanpa mouse; pure matcher smoke-testable di CI.
- **Status:** aktif

## [2026-07-10] FaceTime: hide live bubble while recording

- **Keputusan:** Saat `mode === 'recording'`, UI tidak menampilkan live `CameraBubble` (hanya badge "Camera recording"). Webcam tetap ditulis ke `camera.webm`. Review/export menampilkan satu overlay dari track kamera.
- **Alasan:** Full-display capture membakar bubble live ke screen WebM → double FaceTime di review. Screen Studio-like: kamera dikomposit sekali di akhir, posisi fixed di pojok (di luar auto-zoom).
- **Status:** aktif

## [2026-07-10] Export trim: `-t` duration, not `-to` end

- **Keputusan:** Setelah input `-ss`, batasi output dengan `-t (end-start)` (dengan undershoot 50ms). Full export (start≈0, end≈durasi sumber) **tanpa** `-t`/`-to` — biarkan EOF. Camera filter akhiri `format=yuv420p` + `fps=30` pada input kamera.
- **Alasan:** `-to endMs` setelah seek meminta `endMs` detik output (bukan sisa klip) → overrun → libx264 "Conversion failed!" (exit 234). WebM VFR probe sering lebih panjang dari frame aktual.
- **Status:** aktif
