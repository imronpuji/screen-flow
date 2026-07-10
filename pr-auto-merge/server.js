// Simple Node.js server yang meng-auto-merge PR (Pull Request) open terbaru
// di repo GitHub saat endpoint dipanggil via curl.
//
// Alur:
//   1. AI agent kamu membuat PR ke GitHub.
//   2. Setelah itu, agent menjalankan curl ke server ini.
//   3. Server mencari PR open TERBARU di repo, lalu merge-nya.
//
// Tidak butuh dependency eksternal (pakai http + fetch bawaan Node 18+).

const http = require("http");
const fs = require("fs");
const path = require("path");

// --- Loader .env sederhana (tanpa dependency) ---
// Baca file .env di folder yang sama lalu isikan ke process.env.
function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // buang tanda kutip pembungkus jika ada
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

// --- Konfigurasi (ambil dari .env / environment variable) ---
const PORT = process.env.PORT || 3000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // wajib, taruh di .env
const DEFAULT_OWNER = process.env.GITHUB_OWNER || "imronpuji";
const DEFAULT_REPO = process.env.GITHUB_REPO || "screen-flow";
const MERGE_METHOD = process.env.MERGE_METHOD || "merge"; // merge | squash | rebase

if (!GITHUB_TOKEN) {
  console.error(
    "ERROR: GITHUB_TOKEN belum di-set. Buat file .env (lihat .env.example)."
  );
  process.exit(1);
}

const GH_API = "https://api.github.com";

function gh(path, options = {}) {
  return fetch(`${GH_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "pr-auto-merge-bot",
      ...(options.headers || {}),
    },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GitHub kadang balas 404/5xx sesaat karena replication lag (mis. tepat setelah
// PR baru dibuat). Jadi kita retry beberapa kali sebelum menyerah.
async function ghWithRetry(path, options = {}, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    const res = await gh(path, options);
    if (res.ok) return res;
    if (res.status === 404 || res.status >= 500) {
      last = res;
      await sleep(700 * (i + 1)); // 0.7s, 1.4s, 2.1s...
      continue;
    }
    return res; // error lain (401/403/422) tidak usah di-retry
  }
  return last;
}

// Ambil PR open terbaru (paling baru dibuat) di sebuah repo.
async function getLatestOpenPR(owner, repo) {
  const res = await ghWithRetry(
    `/repos/${owner}/${repo}/pulls?state=open&sort=created&direction=desc&per_page=1`
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gagal ambil daftar PR (${res.status}): ${text}`);
  }
  const list = await res.json();
  return list[0] || null;
}

// Ubah PR draft menjadi "Ready for review" (wajib pakai GraphQL, REST tidak bisa).
async function markReadyForReview(nodeId) {
  const query = `mutation($id:ID!){ markPullRequestReadyForReview(input:{pullRequestId:$id}){ pullRequest { number isDraft } } }`;
  const res = await fetch(`${GH_API}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "User-Agent": "pr-auto-merge-bot",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { id: nodeId } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors) {
    throw new Error(
      `Gagal ubah draft jadi ready: ${JSON.stringify(data.errors || data)}`
    );
  }
  return data;
}

// Merge PR berdasarkan nomor.
async function mergePR(owner, repo, number) {
  const res = await gh(`/repos/${owner}/${repo}/pulls/${number}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: MERGE_METHOD }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Merge gagal (${res.status})`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function send(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  // Healthcheck
  if (req.method === "GET" && req.url === "/") {
    return send(res, 200, { ok: true, message: "PR auto-merge server jalan" });
  }

  // Endpoint utama: trigger merge PR terbaru
  if (req.method === "POST" && req.url === "/merge") {
    const body = await readBody(req);
    const owner = body.owner || DEFAULT_OWNER;
    const repo = body.repo || DEFAULT_REPO;

    if (!owner || !repo) {
      return send(res, 400, {
        ok: false,
        error:
          "owner dan repo wajib diisi (via body JSON atau env GITHUB_OWNER/GITHUB_REPO)",
      });
    }

    try {
      const pr = await getLatestOpenPR(owner, repo);
      if (!pr) {
        return send(res, 404, {
          ok: false,
          error: `Tidak ada PR open di ${owner}/${repo}`,
        });
      }

      // Kalau PR masih draft, ubah dulu jadi "Ready for review" agar bisa di-merge.
      let wasDraft = false;
      if (pr.draft) {
        console.log(`PR #${pr.number} masih draft -> ubah jadi ready...`);
        await markReadyForReview(pr.node_id);
        wasDraft = true;
        await sleep(1000); // beri jeda agar status ter-update di GitHub
      }

      console.log(`Mencoba merge PR #${pr.number} - "${pr.title}"`);
      const result = await mergePR(owner, repo, pr.number);

      console.log(`PR #${pr.number} berhasil di-merge.`);
      return send(res, 200, {
        ok: true,
        merged: true,
        was_draft: wasDraft,
        pr_number: pr.number,
        title: pr.title,
        sha: result.sha,
        message: result.message,
      });
    } catch (err) {
      console.error("Gagal merge:", err.message);
      return send(res, err.status || 500, {
        ok: false,
        error: err.message,
        details: err.body,
      });
    }
  }

  send(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Server siap di http://localhost:${PORT}`);
  console.log(`Trigger merge:  POST http://localhost:${PORT}/merge`);
});
