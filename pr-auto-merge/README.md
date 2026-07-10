# PR Auto-Merge Server

Server Node.js kecil yang, saat dipanggil via `curl`, mencari **PR open terbaru** di repo GitHub kamu lalu langsung **merge**.

Cocok dipasang di AI agent: setelah agent membuat PR, agent menjalankan curl ke server ini untuk otomatis merge.

## 1. Setup

Butuh Node.js versi 18 ke atas (pakai `fetch` bawaan, tanpa dependency).

```bash
cd pr-auto-merge

# 1. Buat GitHub Personal Access Token (scope: repo)
#    https://github.com/settings/tokens

# 2. Set environment variable
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
export GITHUB_OWNER=imronpuji
export GITHUB_REPO=screen-flow

# 3. Jalankan server
npm start
```

Server jalan di `http://localhost:3000`.

## 2. Curl yang ditaruh di AI agent

Kalau `GITHUB_OWNER` & `GITHUB_REPO` sudah di-set di server, cukup:

```bash
curl -X POST http://localhost:3000/merge
```

Atau tentukan repo lewat body (menimpa default):

```bash
curl -X POST http://localhost:3000/merge \
  -H "Content-Type: application/json" \
  -d '{"owner":"imronpuji","repo":"screen-flow"}'
```

## 3. Respon

Sukses:

```json
{
  "ok": true,
  "merged": true,
  "pr_number": 12,
  "title": "Add login page",
  "sha": "abc123...",
  "message": "Pull Request successfully merged"
}
```

Kalau tidak ada PR open, atau merge ditolak (mis. ada conflict / branch protection), server mengembalikan `ok: false` beserta pesan error dari GitHub.

## Cara kerja

1. `POST /merge` → server panggil GitHub API `GET /repos/{owner}/{repo}/pulls?state=open&sort=created&direction=desc` untuk ambil PR terbaru.
2. Lalu `PUT /repos/{owner}/{repo}/pulls/{number}/merge` untuk merge.

## Catatan penting

- **Auto-merge PR terbaru** artinya server selalu ambil PR open yang paling baru dibuat. Pastikan agent memanggil curl tepat setelah membuat PR agar tidak salah target.
- Untuk akses dari internet (bukan localhost), deploy ke server/VPS atau pakai tunnel seperti `ngrok`.
- Endpoint ini **tanpa autentikasi** sesuai permintaan. Kalau nanti diekspos ke publik, sangat disarankan menambahkan secret token agar tidak sembarang orang bisa memicu merge.
