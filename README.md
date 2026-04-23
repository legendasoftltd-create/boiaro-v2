# BoiAro v2 Setup

## Fresh Setup (Required)
Run from project root:

```bash
npm install
cd server && npm install
cp .env.example .env
# Edit server/.env:
# DATABASE_URL=postgresql://...
# JWT_SECRET=<secure value>
# JWT_REFRESH_SECRET=<secure value>
# GOOGLE_CLIENT_ID=<google oauth web client id>
# CORS_ORIGIN=http://localhost:8080
# NODE_ENV=development

npx prisma db push --force-reset
npm run db:generate
npm run seed:defaults
cd ..
npm run build:full
npm run server:start
```

## Optional Legacy Data Import
Use this only if you need old users/books CSV content.

```bash
cd server
npm run seed:legacy
```

Or run both defaults + legacy together:

```bash
cd server
npm run seed:all
```

## Seed Validation (Dry Run)
Check seed behavior without writing to DB:

```bash
cd server
npx prisma db seed -- --dry-run
```

## Local URLs
- App: `http://localhost:8080/`
- API (tRPC): `http://localhost:3001/trpc/...`
- Reader auth: `http://localhost:8080/auth`
- Admin: `http://localhost:8080/admin`
- Creator auth: `http://localhost:8080/creator-auth`
- RJ auth: `http://localhost:8080/rj-auth`

## Google Login Setup
1. Create an OAuth 2.0 **Web application** client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Add `http://localhost:8080` to **Authorized JavaScript origins** (and your production domain later).
3. Set frontend env var:
   - root `.env`: `VITE_GOOGLE_CLIENT_ID=...`
4. Set backend env var:
   - `server/.env`: `GOOGLE_CLIENT_ID=...`
5. Restart both frontend and backend servers after changing env vars.