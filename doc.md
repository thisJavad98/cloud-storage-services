# Cloud Storage — Security & Data Systems Documentation

**File:** `doc.md`  
**Updated:** 2026-09-28  
**Repos:**
- Backend: `cloud-storage-services` (this repo)
- Frontend: `cloud-storage` (Next.js UI)

---

## 1. What this project is

A personal cloud-storage product with:

- JWT authentication (login / refresh / profile / avatar)
- Encrypted file storage with auth-gated download
- Folders + trash + search + Data Island browse API
- Persian RTL mobile-style Next.js UI

---

## 2. Security architecture (overview)

This backend implements a **defense-in-depth** model for safe file save/use:

| Layer | What it does |
|---|---|
| **Transport (TLS / HTTPS)** | Client ↔ API traffic is encrypted in production (Render / Vercel). This is the “end-to-end over the wire” path for API calls and downloads. |
| **Authentication (JWT)** | Every file/folder route requires a valid Bearer access token. Unauthenticated clients cannot list, upload, or download. |
| **Authorization (ownership)** | Files/folders are scoped by `user_id`. One account cannot read another account’s objects. |
| **At-rest encryption (AES-256-GCM)** | File bytes are encrypted **before** they hit disk or Vercel Blob. Storage only holds ciphertext. |
| **Auth-proxied download** | Downloads never redirect to a public blob URL. The API loads ciphertext, decrypts in memory, and streams plaintext only to the authenticated owner. |
| **Integrity (SHA-256)** | Plaintext checksum is stored in SQLite (`checksum_sha256`) at upload time. |
| **Upload allow-list** | Extension + MIME + size + path-traversal checks reject unsafe uploads. |
| **Rate limiting** | Per-IP limits on `/api`, `/api/auth`, and `/api/files` reduce brute-force and abuse. |
| **CORS allow-list** | Only configured frontend origins may call the API from a browser. |
| **HTTP hardening (Helmet)** | Security headers (incl. no-referrer, CORP). |
| **Password hashing (bcryptjs)** | Account passwords are never stored in plaintext. |
| **No public file static mount** | `/uploads` user files are **not** publicly served. Only `/uploads/avatars` is static. |

### Important clarification: “end-to-end”

| Meaning | Status in this app |
|---|---|
| **TLS end-to-end (client ↔ server)** | Yes — HTTPS in production; downloads go only through authenticated API. |
| **At-rest encryption (server key)** | Yes — AES-256-GCM with `FILE_ENCRYPTION_KEY` on the server. |
| **Zero-knowledge client E2E** (only the user’s device holds keys; server never sees plaintext) | **Not** implemented. The server decrypts to serve files. True client-side E2E would require browser-side key management (future frontend work). |

With the current design: a leaked Blob URL or stolen disk file is **ciphertext**. An attacker still needs the server encryption key **and** a valid user JWT (or DB access) to obtain useful plaintext through normal paths.

---

## 3. Data systems

### 3.1 Metadata store — SQLite (sql.js)

| Item | Detail |
|---|---|
| Engine | **sql.js** (SQLite compiled to WASM — no native bindings) |
| File | `DB_PATH` (default `./data/cloud-storage.db`) |
| What it stores | Users, folders, file **metadata**, activity logs, refresh tokens |
| What it does **not** store | File binary content (only `storage_key` + checksum + size + mime) |

**Core tables (relevant to files):**

| Table | Role |
|---|---|
| `users` | Accounts, bcrypt password hash, quota, avatar URL |
| `folders` | Nested folder tree (`parent_id`, `path`) |
| `files` | Metadata: name, mime, size, `storage_key`, `checksum_sha256`, trash flags |
| `activity_logs` | Audit trail (upload, trash, delete, auth events) |
| `refresh_tokens` | Refresh token hashes / expiry |

### 3.2 Object store — dual backend

| Mode | When | Where bytes live | `storage_key` value |
|---|---|---|---|
| **Local disk** | `BLOB_READ_WRITE_TOKEN` unset | `./uploads` (or `STORAGE_PATH`) | Local filename (e.g. `uuid.pdf.enc`) |
| **Vercel Blob** | Token set | Vercel Blob store | Full HTTPS blob URL |

**Why Vercel Blob:** Render (and many PaaS) disks are ephemeral. Blob keeps files durable across deploys and available from every device.

**Current Blob SDK note:** `@vercel/blob` in this project uploads with `access: 'public'`. Security does **not** rely on URL secrecy. It relies on:

1. AES-256-GCM ciphertext in the blob  
2. Content-Type stored as `application/octet-stream` when encryption is on  
3. API never redirects browsers to the raw URL — only auth + decrypt + stream  

### 3.3 Encryption format (at rest)

**Module:** `src/security/cryptoAtRest.js`

| Field | Value |
|---|---|
| Algorithm | **AES-256-GCM** |
| Key | `FILE_ENCRYPTION_KEY` — 64 hex chars (32 bytes) **or** any passphrase (SHA-256 derived) |
| IV | 12 random bytes per file |
| Auth tag | 16 bytes (GCM) |
| Wire layout | `CSENC1` (6) \| IV (12) \| TAG (16) \| CIPHERTEXT |

**Legacy compatibility:** Objects without the `CSENC1` magic header are treated as plaintext (old uploads still download). New uploads are encrypted when the key is set.

**Checksum:** SHA-256 is computed on **plaintext** before encryption so integrity checks describe the real file.

### 3.4 Upload → store → download pipeline

```
Client (HTTPS + JWT)
  │  multipart upload
  ▼
Multer (temp disk) → fileGuard (ext/MIME/size)
  │
  ▼
SHA-256(plaintext) → SQLite metadata
  │
  ▼
AES-256-GCM encrypt → local disk OR Vercel Blob (ciphertext only)
  │
  ▼
Download: JWT + ownership check
  → fetch ciphertext
  → decrypt in memory
  → stream plaintext (Cache-Control: no-store)
```

---

## 4. Security modules & middleware (code map)

| Path | Purpose |
|---|---|
| `src/security/cryptoAtRest.js` | AES-256-GCM encrypt / decrypt / SHA-256 |
| `src/security/fileGuard.js` | Upload allow-list (extensions, MIME, size, safe names) |
| `src/middleware/rateLimit.js` | In-memory sliding window rate limiter |
| `src/middleware/auth.js` | Bearer JWT verification + active user check |
| `src/middleware/validate.js` | express-validator rules for JSON bodies |
| `src/middleware/noStore.js` | Cache-Control: no-store on API responses |
| `src/config/storage.js` | Encrypt-on-write, decrypt-on-read, Blob/local IO |
| `src/config/env.js` | Secrets, CORS origins, quotas, encryption key |
| `src/app.js` | Helmet, CORS allow-list, rate limits, avatar-only static |

---

## 5. Stack

### Backend (`cloud-storage-services`)

| Technology | Role |
|---|---|
| **Node.js** (≥18) | Runtime (`fetch` used for Blob reads) |
| **Express.js 4** | HTTP API |
| **sql.js** | SQLite metadata DB |
| **multer 2.x** | Multipart uploads |
| **bcryptjs** | Password hashing |
| **jsonwebtoken** | Access + refresh tokens |
| **@vercel/blob** | Durable object storage |
| **Node `crypto`** | AES-256-GCM + SHA-256 |
| **helmet / cors / morgan** | Headers, CORS, logging |
| **express-validator** | Input validation |
| **uuid** | Resource IDs |

### Frontend (`cloud-storage`)

| Technology | Role |
|---|---|
| **Next.js 16** (App Router) | UI |
| **React 19** | Components |
| **Tailwind CSS v4** | Styling |
| **Vazirmatn** | Persian font, RTL |
| **localStorage session** | Access/refresh tokens |

---

## 6. Environment variables

```bash
PORT=4000
NODE_ENV=development
DB_PATH=./data/cloud-storage.db
STORAGE_PATH=./uploads
MAX_UPLOAD_BYTES=104857600
MAX_AVATAR_BYTES=2097152
JWT_ACCESS_SECRET=<strong-random>
JWT_REFRESH_SECRET=<strong-random>
JWT_ACCESS_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
DEFAULT_STORAGE_QUOTA_BYTES=5368709120
SIGNUP_ENABLED=false

# Required for encrypted at-rest storage (generate with):
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
FILE_ENCRYPTION_KEY=<64-hex-chars>

# Browser origins allowed to call the API
CORS_ORIGINS=http://localhost:3000,https://cloud-storage-five-nu.vercel.app

# Durable multi-device object storage (recommended in production)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

**Production checklist:**

1. Set strong `JWT_*_SECRET` values (never use `dev-*` defaults).  
2. Set `FILE_ENCRYPTION_KEY` and **never rotate it** without a re-encrypt migration (old ciphertext needs the same key).  
3. Set `BLOB_READ_WRITE_TOKEN` so files survive deploys.  
4. Set `CORS_ORIGINS` to your real frontend URL(s) only.  
5. Keep `SIGNUP_ENABLED=false` unless you intentionally open registration.  
6. Serve the API only over HTTPS.

---

## 7. API surface (files)

All routes under `/api/files` require `Authorization: Bearer <accessToken>`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/files` | List files |
| `GET` | `/api/files/search` | Search files + folders |
| `GET` | `/api/files/island` | Data Island browse (folders + files) |
| `POST` | `/api/files` | Upload (`multipart` field `file`) — encrypted at rest |
| `GET` | `/api/files/:id` | Metadata (no `storageKey` exposed) |
| `GET` | `/api/files/:id/download` | Auth-only decrypt + stream |
| `PATCH` | `/api/files/:id` | Rename / move |
| `POST` | `/api/files/:id/trash` | Soft delete |
| `POST` | `/api/files/:id/restore` | Restore |
| `DELETE` | `/api/files/:id` | Permanent delete (+ object delete) |
| `*` | `/api/files/folders...` | Folder CRUD |

**Rate limits (default):**

| Scope | Window | Max |
|---|---|---|
| `/api` | 1 min | 180 |
| `/api/auth` | 15 min | 40 |
| `/api/files` | 1 min | 60 |

---

## 8. What changed in this security upgrade

1. **AES-256-GCM at-rest encryption** for new uploads when `FILE_ENCRYPTION_KEY` is set.  
2. **Auth-proxied downloads** — no more `302` redirect to public Blob URLs.  
3. **`storageKey` removed** from public file JSON (prevents leaking Blob URLs).  
4. **Upload allow-list** via `fileGuard` (extensions / MIME / size / safe names).  
5. **CORS allow-list** via `CORS_ORIGINS`.  
6. **Rate limiting** on API, auth, and files.  
7. **Static `/uploads` locked down** — only avatars remain publicly readable.  
8. **Helmet / no-store / nosniff** tightened on download and avatar responses.  
9. **Health/startup logs** report whether Blob + encryption are active.

---

## 9. Local run

```bash
cd cloud-storage-services
cp .env.example .env   # then fill FILE_ENCRYPTION_KEY / secrets
npm install
npm start
# → http://localhost:4000/api/health
```

Frontend should point `NEXT_PUBLIC_API_URL` (or equivalent) at this API origin.

---

## 10. Threat model (practical)

| Threat | Mitigation |
|---|---|
| Stolen Blob URL | Ciphertext only; download still needs JWT + server key |
| Stolen disk snapshot of `uploads/` | Ciphertext when encryption enabled |
| Brute-force login | Auth rate limit + bcrypt |
| CSRF from random sites | CORS allow-list + Bearer tokens (not cookie session) |
| Path traversal upload name | `fileGuard` + sanitized names |
| Quota abuse | Per-user `storage_quota_bytes` |
| Stale client caches | `Cache-Control: no-store` on downloads/API |
| Cross-user access | Ownership checks on every file/folder op |

**Out of scope today:** client-held zero-knowledge keys, malware scanning (AV), WAF, multi-region key management / KMS. Those can be layered later without changing the metadata model.
