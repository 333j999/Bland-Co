# Bland & Co — setup

Static site + Vercel serverless API + **Convex** database. This is a **public repo**, so
**no secrets are committed** — every key lives in env vars (Vercel + Convex).

## Architecture

```
Browser ──► /api/* (Vercel functions)  ──►  Convex (database)
            • auth (JWT, env secret)         • records table (one row per item)
            • email (Resend)                 • kv table (site settings)
            • Cloudinary signing             reachable only via a shared backend secret
```

The front-end never holds a key. The Vercel API talks to Convex over its HTTP API,
passing a shared `BACKEND_SECRET` that every Convex function verifies — so the database
is private to our backend even though the repo is open.

## One-time setup

1. **Install + provision Convex** (opens a browser to log in / create the deployment):
   ```
   npm install
   npx convex dev          # leave running; it writes .env.local with CONVEX_URL and generates convex/_generated
   ```

2. **Set the Convex backend secret** (pick a long random string):
   ```
   npx convex env set BACKEND_SECRET <random-string>
   npx convex deploy       # push schema + functions to prod
   ```

3. **Set the Vercel env vars** (Project → Settings → Environment Variables) — see `.env.example`:
   - `JWT_SECRET` — long random string
   - `ADMIN_PASSWORD` — admin login password
   - `CONVEX_URL` — the deployment URL from step 1
   - `CONVEX_BACKEND_SECRET` — **same value** as Convex `BACKEND_SECRET`
   - `RESEND_API_KEY`, `RESEND_FROM`
   - `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` (preferred),
     or `CLOUDINARY_UPLOAD_PRESET` (unsigned fallback)

4. **Import the seed data** (optional, one time, on an empty deployment):
   ```
   CONVEX_URL=... CONVEX_BACKEND_SECRET=... node scripts/migrate-to-convex.mjs
   ```

## Notes

- `data/*.json` are sample seed data only; the live data lives in Convex.
- The admin panel reads/writes through the same `/api/*` routes — no change needed.
- Without the env vars set, the API fails closed (no weak defaults): admin login returns
  503, and JWT verification rejects everything.
