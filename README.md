# IRL Hide & Seek

Mobile-only PWA for real-world hide and seek: draw a geofence, pick sides, then hiders get pinged
on a random timer while seekers close in. See [CLAUDE.md](CLAUDE.md) for architecture, schema,
formulas and design notes.

| Part | Path | Host |
|---|---|---|
| Next.js 16 PWA | `apps/web` | Vercel |
| Authoritative game server (Express + Socket.io) | `apps/server` | Render |
| Shared types / constants / formulas | `packages/shared` | — |
| Schema, RLS, RPCs + SQL tests | `supabase/` | Supabase |

## Local development

Requires Node 22 (`.nvmrc`).

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
cp apps/server/.env.example apps/server/.env
npm run dev:server   # http://localhost:4000
npm run dev:web      # http://localhost:3000
```

Phones need HTTPS for GPS — test through a Vercel preview or a tunnel. Without Supabase you can
still QA the UI at `/dev/lobby` and `/dev/match` (dev-only fixtures, 404 in production).

```bash
npm run typecheck    # tsc --noEmit in every package
npm run lint
npm test             # SQL (PGlite) + server (vitest, socket e2e) + web unit tests
```

## Deploy

### 1. Supabase
1. Create a project. **Auth → Providers → Anonymous sign-ins: enable.**
2. Apply migrations in order (`supabase/migrations/0001_*.sql`, `0002_*.sql`) with
   `supabase db push` or the SQL editor.
3. Note the project URL, anon key and service-role key (Settings → API).

### 2. Render (game server)
1. New → **Blueprint** → select this repo (uses `render.yaml`).
2. Fill the prompted secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `CORS_ORIGINS` (e.g. `https://your-app.vercel.app,https://*.vercel.app`).
3. Keep **one instance** on a paid plan — match timers live in memory, and free instances sleep.

### 3. Vercel (web)
1. Import the repo; set **Root Directory = `apps/web`** (keep "include files outside root" on).
2. Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `NEXT_PUBLIC_GAME_SERVER_URL` (your Render URL), optional `NEXT_PUBLIC_MAP_STYLE_URL`.
3. Deploy, then add the production domain to Render's `CORS_ORIGINS`.

## Platform notes
- Haptics use `navigator.vibrate` (Android); iOS Safari has none, so on-screen banners carry alerts.
- Stealth mode keeps the screen awake with the Wake Lock API (iOS 16.4+ / Chrome).
- Map tiles default to OpenFreeMap (no key); any MapLibre style URL works.
