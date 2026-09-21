# Cloud Storage

Next.js frontend for cloud storage. Requires **Node.js 20.9+** (Next.js 16).

Connects to the backend at [`cloud-storage-services`](https://github.com/thisJavad98/cloud-storage-services).

## Pages

| Route | Page |
| --- | --- |
| `/` | Intro |
| `/signup` | Create account (`POST /api/auth/signup`) |
| `/login` | Sign in (`POST /api/auth/login`) |
| `/dashboard` | Files dashboard (requires session) |

## Backend connection

1. Start the API (see backend README for Neon + Blob env):

```bash
cd ../cloud-storage-services
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

2. Frontend env:

```bash
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

Auth services live in `services/auth.js` and call:

- `POST /auth/signup` — `{ email, password, fullName }`
- `POST /auth/login` — `{ email, password }`
- `GET /auth/me` — `Authorization: Bearer <accessToken>`

File uploads use `@vercel/blob/client` against the API `POST /files/upload` endpoint, then `POST /files/complete`.

Tokens and user are stored in `localStorage` via `lib/session.js`.

## Prerequisites

- Node.js `>=20.9.0` (recommended: Node 22)
- npm, pnpm, yarn, or bun

If you use [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install    # reads .nvmrc (Node 22)
nvm use
node -v        # should be v20.9.0 or higher
```

## Install

```bash
npm install
```

## Run (development)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel (frontend project)

1. Deploy **cloud-storage-services** first and note its URL
2. Import this repo into Vercel as a separate project
3. Set `NEXT_PUBLIC_API_URL=https://<api-project>.vercel.app/api`
4. Deploy
5. On the API project, set `FRONTEND_ORIGIN=https://<this-frontend>.vercel.app` and redeploy

## Learn more

- [Next.js Documentation](https://next.js.org/docs)
- [Vercel Blob client uploads](https://vercel.com/docs/storage/vercel-blob/client-upload)
