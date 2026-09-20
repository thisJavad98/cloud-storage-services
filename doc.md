# Cloud Storage — Project Documentation

**File:** `doc.md`  
**Updated:** 2026-09-20  
**Repos:**
- Backend: `cloud-storage-services`
- Frontend: `cloud-storage`

---

## 1. What this project is

A personal cloud-storage product with:

- JWT auth (signup / login / profile)
- File upload & CRUD (metadata in SQLite, bytes on disk)
- Folders
- A Persian RTL mobile-style Next.js UI

---

## 2. New technologies & stack

### Backend (`cloud-storage-services`)

| Technology | Role |
|---|---|
| **Node.js** (≥18 recommended) | Runtime |
| **Express.js 4** | HTTP API framework |
| **sql.js** | SQLite in WASM (no native build); DB file at `./data/cloud-storage.db` |
| **multer 2.x** | Multipart file uploads |
| **bcryptjs** | Password hashing |
| **jsonwebtoken** | Access + refresh tokens |
| **dotenv** | Environment config |
| **helmet / cors / morgan** | Security, CORS, request logging |
| **express-validator** | Input validation |
| **uuid** | IDs for users, files, folders |

**Storage model (important):**
- File **metadata** → SQLite tables (`files`, `folders`, …)
- File **content** → filesystem under `./uploads` (key stored as `storage_key`)
- Not BLOB-in-DB — matches the schema design (`storage_key` column)

### Frontend (`cloud-storage`)

| Technology | Role |
|---|---|
| **Next.js 16** (App Router) | UI framework |
| **React 19** | Components |
| **Tailwind CSS v4** | Styling + design tokens (`cs-blue`, …) |
| **Vazirmatn** | Persian font, RTL layout |
| **localStorage session** | Tokens + user (`cs_access_token`, …) |

---

## 3. Work completed (chronological)

### A. Local setup & env
- Created `.env` and `.env.example`
- Installed npm dependencies
- Ran DB migrate
- Started API on `http://localhost:4000`
- Verified health + signup

**Env vars:**

```bash
PORT=4000
NODE_ENV=development
DB_PATH=./data/cloud-storage.db
STORAGE_PATH=./uploads
MAX_UPLOAD_BYTES=104857600
JWT_ACCESS_SECRET=dev-access-secret
JWT_REFRESH_SECRET=dev-refresh-secret
JWT_ACCESS_EXPIRES_IN=15m
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
| `src/services/files.service.js` | Upload, list, get, update, trash, restore, delete, folders |
| `src/controllers/files.controller.js` | HTTP adapters |
| `src/routes/files.routes.js` | Auth + multer + routes |
| `src/config/storage.js` | Upload directory helpers |
| `src/config/env.js` | `STORAGE_PATH`, `MAX_UPLOAD_BYTES` |
| `src/routes/index.js` | Mount `/api/files` |
| `src/app.js` | CORS-friendly helmet for downloads |
| `src/middleware/validate.js` | File/folder validation rules |
| `uploads/` | Stored file bytes (gitignored) |

**API endpoints (all need `Authorization: Bearer <accessToken>` except auth):**

| Method | Endpoint | Action |
|---|---|---|
| `POST` | `/api/files` | Upload (`multipart` field name: `file`) |
| `GET` | `/api/files` | List (`search`, `folderId`, `trashed`, `limit`, `offset`) |
| `GET` | `/api/files/:id` | File metadata |
| `GET` | `/api/files/:id/download` | Download binary |
| `PATCH` | `/api/files/:id` | Rename / move (`name`, `folderId`) |
| `POST` | `/api/files/:id/trash` | Soft delete |
| `POST` | `/api/files/:id/restore` | Restore from trash |
| `DELETE` | `/api/files/:id` | Permanent delete (+ free quota) |
| `GET` | `/api/files/folders` | List folders (+ `fileCount`) |
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
