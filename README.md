# cloud-storage-services

Express.js backend for a cloud storage platform: auth (signup/login), SQLite (via `sql.js`) schema for users, folders, files, versions, shares, and activity logs.

## Requirements

- Node.js **18+** (recommended: 20 or 22)
- npm 9+

```bash
# If you use nvm:
nvm use 22
```

## Setup

```bash
cd cloud-storage-services
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

Server defaults to `http://localhost:4000`.

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

## Database tables

| Table | Purpose |
|-------|---------|
| `users` | Accounts, password hash, role, storage quota/usage |
| `refresh_tokens` | Login sessions / JWT refresh rotation |
| `folders` | Nested folder tree per user (soft delete) |
| `files` | File metadata + storage key (soft delete) |
| `file_versions` | Previous file versions |
| `shares` | File/folder sharing (user or link + permission) |
| `activity_logs` | Audit trail (signup, login, etc.) |

Schema file: `src/db/schema.sql`  
Reset DB: `npm run db:reset`

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
