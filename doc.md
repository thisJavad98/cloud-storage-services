# Cloud Storage — Project Documentation

**File:** `doc.md`  
**Updated:** 2026-09-21  
**Repos:**
- Backend: `cloud-storage-services`
- Frontend: `cloud-storage`

---

## 1. What this project is

A personal cloud-storage product with:

- JWT auth (signup / login / profile)
- File upload & CRUD (metadata in **Neon Postgres**, bytes in **Vercel Blob**)
- Folders
- A Persian RTL mobile-style Next.js UI
- Deployable as **two Vercel projects** (API + web)

---

## 2. New technologies & stack

### Backend (`cloud-storage-services`)

| Technology | Role |
|---|---|
| **Node.js** (≥18 recommended) | Runtime |
| **Express.js 4** | HTTP API framework (local `src/server.js` + Vercel `api/index.js`) |
| **Neon Postgres** (`@neondatabase/serverless`) | Durable metadata DB |
| **Vercel Blob** (`@vercel/blob`) | File / avatar object storage |
| **multer 2.x** | Avatar multipart (memory → Blob), ≤2MB |
| **bcryptjs** | Password hashing |
| **jsonwebtoken** | Access + refresh tokens |
| **dotenv** | Environment config |
| **helmet / cors / morgan** | Security, CORS, request logging |
| **express-validator** | Input validation |
| **uuid** | IDs for users, files, folders |

**Storage model (important):**
- File **metadata** → Postgres tables (`files`, `folders`, …)
- File **content** → Vercel Blob (`storage_key` holds the public Blob URL)
- Library uploads: browser → Blob via `@vercel/blob/client`, then `POST /api/files/complete`
- Avatars: `POST /api/auth/avatar` → Blob; `avatar_url` is an HTTPS URL

### Frontend (`cloud-storage`)

| Technology | Role |
|---|---|
| **Next.js 16** (App Router) | UI framework |
| **React 19** | Components |
| **Tailwind CSS v4** | Styling + design tokens (`cs-blue`, …) |
| **Vazirmatn** | Persian font, RTL layout |
| **@vercel/blob/client** | Direct client uploads to Blob |
| **localStorage session** | Tokens + user (`cs_access_token`, …) |

---

## 2b. Vercel deploy (two projects)

1. Neon DB → `DATABASE_URL`
2. Deploy API repo on Vercel → enable Blob → set `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `FRONTEND_ORIGIN`, JWT secrets → `npm run db:migrate`
3. Deploy frontend repo → `NEXT_PUBLIC_API_URL=https://<api>.vercel.app/api`
4. Set API `FRONTEND_ORIGIN` to the frontend URL

See each repo README for full steps.

---

## 3. Work completed (chronological)

### A. Local setup & env
- Created `.env` and `.env.example`
- Installed npm dependencies
- Ran DB migrate
- Started API on `http://localhost:4000`
- Verified health + signup

**Env vars (current):**

```bash
PORT=4000
NODE_ENV=development
DATABASE_URL=postgresql://...
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
FRONTEND_ORIGIN=http://localhost:3000
MAX_UPLOAD_BYTES=104857600
JWT_ACCESS_SECRET=dev-access-secret
JWT_REFRESH_SECRET=dev-refresh-secret
JWT_ACCESS_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
DEFAULT_STORAGE_QUOTA_BYTES=5368709120
```

### B. Demo user
Created account:

- Email: `mj407382@gmail.com`
- Password: `Javad_3001`

### C. Backend — File CRUD API (new)

**New / updated files:**

| Path | Purpose |
|---|---|
| `src/services/files.service.js` | Upload register, list, get, update, trash, restore, delete, folders |
| `src/controllers/files.controller.js` | HTTP adapters + Blob `handleUpload` |
| `src/routes/files.routes.js` | Auth + Blob upload/complete routes |
| `src/config/storage.js` | Vercel Blob helpers |
| `src/config/env.js` | `DATABASE_URL`, Blob, CORS, quotas |
| `src/routes/index.js` | Mount `/api/files` |
| `src/app.js` | CORS via `FRONTEND_ORIGIN` |
| `src/middleware/validate.js` | File/folder validation rules |
| `api/index.js` / `vercel.json` | Vercel serverless entry |

**API endpoints (all need `Authorization: Bearer <accessToken>` except auth):**

| Method | Endpoint | Action |
|---|---|---|
| `POST` | `/api/files` | Upload (`multipart` field name: `file`) |
| `GET` | `/api/files` | List (`search`, `folderId`, `mimeType`, `minSize`, `maxSize`, `trashed`, `limit`, `offset`) |
| `GET` | `/api/files/search` | Search files + folders (`q`/`search`, `scope=all\|files\|folders`, `folderId`, `mimeType`, `minSize`, `maxSize`, `limit`) |
| `GET` | `/api/files/:id` | File metadata |
| `GET` | `/api/files/:id/download` | Download binary |
| `PATCH` | `/api/files/:id` | Rename / move (`name`, `folderId`) |
| `POST` | `/api/files/:id/trash` | Soft delete |
| `POST` | `/api/files/:id/restore` | Restore from trash |
| `DELETE` | `/api/files/:id` | Permanent delete (+ free quota) |
| `GET` | `/api/files/folders` | List folders (`search`, `parentId`, + `fileCount`) |
| `POST` | `/api/files/folders` | Create folder |

**Also still available:**

| Method | Endpoint |
|---|---|
| `POST` | `/api/auth/signup` |
| `POST` | `/api/auth/login` |
| `GET` | `/api/auth/me` |
| `PATCH` | `/api/auth/me` | Update `fullName`, `bio` |
| `POST` | `/api/auth/avatar` | Upload avatar (`multipart` field: `avatar`) |
| `DELETE` | `/api/auth/avatar` | Remove avatar |
| `GET` | `/api/health` |

Avatars are stored under `uploads/avatars/` and served statically at `/uploads/...`.

**Behaviors implemented:**
- Quota check before upload
- SHA-256 checksum
- Unique name per folder
- Soft trash vs permanent delete
- Activity log entries (`file.upload`, `file.update`, …)
- Storage usage updated on users table

### D. Frontend — UI for file services (new)

**New / updated files in `~/Desktop/Code/GitHub/cloud-storage`:**

| Path | Purpose |
|---|---|
| `services/files.js` | Client API: upload, list, rename, trash, delete, download, folders |
| `lib/api.js` | Supports `FormData` uploads + raw download responses |
| `components/BottomNav.js` | Shared bottom navigation |
| `components/Icons.js` | Added upload / download / trash / edit / plus icons |
| `app/dashboard/page.js` | Live storage ring, folders, recent files, upload CTA |
| `app/files/page.js` | Full management page (CRUD UI) |
| `app/profile/page.js` | Profile: avatar upload, name/bio edit, logout |
| `components/UserAvatar.js` | Shared avatar with image / initials fallback |
| `services/auth.js` | `updateProfile`, `uploadAvatar`, `removeAvatar` |

**Pages:**

| Route | What it does |
|---|---|
| `/dashboard` | Home: greeting, search, quota card, folders, recent files, upload |
| `/files` | Manage: upload, create folder, rename, download, trash, permanent delete |
| `/profile` | Customize profile image, display name, bio; logout |

UI matches existing design: phone shell (390px), `dash-pattern`, blue cards, yellow folders, Persian copy, RTL.

---

## 4. How to run

### Backend
```bash
cd ~/Desktop/Code/GitHub/cloud-storage-services
cp .env.example .env
npm install
npm run db:migrate
npm run dev    # or: npm start
```
→ `http://localhost:4000`

### Frontend
```bash
cd ~/Desktop/Code/GitHub/cloud-storage
# ensure NEXT_PUBLIC_API_URL=http://localhost:4000/api
npm install
npm run dev
```
→ usually `http://localhost:3000`

---

## 5. Example API calls

```bash
# Login
curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"mj407382@gmail.com","password":"Javad_3001"}'

# Upload
curl -s -X POST http://localhost:4000/api/files \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -F "file=@./myfile.pdf"

# List
curl -s http://localhost:4000/api/files \
  -H "Authorization: Bearer ACCESS_TOKEN"

# Rename
curl -s -X PATCH http://localhost:4000/api/files/FILE_ID \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"new-name.pdf"}'
```

---

## 6. Database tables used

| Table | Purpose |
|---|---|
| `users` | Accounts + storage quota/usage |
| `refresh_tokens` | JWT refresh sessions |
| `folders` | Nested folders per user |
| `files` | File metadata + `storage_key` |
| `file_versions` | Schema ready (not fully wired in UI yet) |
| `shares` | Schema ready (sharing API not built yet) |
| `activity_logs` | Audit trail |

---

## 7. Not done yet (future)

- File versioning API (table exists)
- Sharing links / permissions API (table exists)
- Move files into folders from UI
- Trash bin page (restore UI)
- Refresh-token rotation endpoint on frontend
- Production secrets / cloud object storage (S3, etc.)

---

## 8. Summary of “all the works”

1. Fixed local setup (env, install, migrate, run server)
2. Created user `mj407382@gmail.com`
3. Built full **file CRUD backend** with disk storage + SQLite metadata
4. Added folder list/create APIs
5. Built frontend **services + dashboard + `/files` management UI**
6. Matched existing Persian mobile UI style
7. Wrote this documentation file (`doc.md`)
