# Screen Flow — Architecture Decisions

Format: `## [YYYY-MM-DD] <judul>` · Keputusan · Alasan · Status (aktif/digantikan)

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
- **Status:** aktif (sementara)
