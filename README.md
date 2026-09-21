# cloud-storage-services

Express.js backend for a cloud storage platform: auth (signup/login), Neon Postgres for metadata, and Vercel Blob for file bytes.

Designed to run locally with Node.js **or** as a Vercel serverless API.

## Requirements

- Node.js **18+** (recommended: 20 or 22)
- npm 9+
- A [Neon](https://neon.tech) Postgres database
- A [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) read/write token

## Setup (local)

```bash
cd cloud-storage-services
cp .env.example .env
# Fill DATABASE_URL, BLOB_READ_WRITE_TOKEN, FRONTEND_ORIGIN, JWT secrets
npm install
npm run db:migrate
npm run dev
```

Server defaults to `http://localhost:4000`.

### Env vars

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token |
| `FRONTEND_ORIGIN` | Allowed CORS origin(s), comma-separated (e.g. `http://localhost:3000` or your Vercel app URL) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Strong random secrets in production |
| `MAX_UPLOAD_BYTES` | Max library file size (default 100MB) |
| `MAX_AVATAR_BYTES` | Max avatar size (default 2MB) |

## Auth APIs

### Sign up

`POST /api/auth/signup`

```json
{
  "email": "jane@example.com",
  "password": "Secret123",
  "fullName": "Jane Doe"
}
```

### Login

`POST /api/auth/login`

```json
{
  "email": "jane@example.com",
  "password": "Secret123"
}
```

Both return:

```json
{
  "success": true,
  "message": "...",
  "data": {
    "user": { "id": "...", "email": "...", "fullName": "...", "...": "..." },
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

### Current user

`GET /api/auth/me`  
Header: `Authorization: Bearer <accessToken>`

### Health

`GET /api/health`

## File uploads (Vercel Blob)

Large files are **not** posted as multipart to Express (Vercel body limit ~4.5MB). Flow:

1. Client calls `POST /api/files/upload` via `@vercel/blob/client` `upload()` (auth required)
2. Bytes go directly to Vercel Blob
3. Client calls `POST /api/files/complete` with blob metadata to register the file row

Avatars still use `POST /api/auth/avatar` (multipart ≤2MB) and are stored in Blob.

Downloads: `GET /api/files/:id/download` redirects to the Blob URL.

## Database tables

| Table | Purpose |
|-------|---------|
| `users` | Accounts, password hash, role, storage quota/usage |
| `refresh_tokens` | Login sessions / JWT refresh rotation |
| `folders` | Nested folder tree per user (soft delete) |
| `files` | File metadata + Blob URL in `storage_key` (soft delete) |
| `file_versions` | Previous file versions |
| `shares` | File/folder sharing (user or link + permission) |
| `activity_logs` | Audit trail (signup, login, etc.) |

Schema file: `src/db/schema.sql`  
Reset DB: `npm run db:reset`

## Deploy on Vercel (API project)

1. Create a Neon database and copy `DATABASE_URL`
2. Import this repo into Vercel as a new project
3. Enable **Blob** storage on the project and copy `BLOB_READ_WRITE_TOKEN`
4. Set env vars: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `FRONTEND_ORIGIN`, JWT secrets
5. Deploy
6. Run migrations once against Neon:  
   `DATABASE_URL=... npm run db:migrate`
7. Point the frontend `NEXT_PUBLIC_API_URL` to `https://<this-project>.vercel.app/api`
8. Set `FRONTEND_ORIGIN` to the frontend Vercel URL and redeploy if needed

`vercel.json` rewrites all traffic to `api/index.js` (Express serverless entry). Local `npm run dev` still uses `src/server.js`.

### Frontend changes

Apply the patched files from [`deploy/frontend-patches/`](./deploy/frontend-patches/) into the sibling `cloud-storage` repo (see `APPLY.md` there). Install `@vercel/blob` on the frontend, then deploy it as a second Vercel project with `NEXT_PUBLIC_API_URL` pointing at this API.

## Example curl

```bash
# Signup
curl -s -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"jane@example.com","password":"Secret123","fullName":"Jane Doe"}'

# Login
curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"jane@example.com","password":"Secret123"}'

# Me (replace TOKEN)
curl -s http://localhost:4000/api/auth/me \
  -H 'Authorization: Bearer TOKEN'
```
