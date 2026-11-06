# IRL Hide & Seek — Project Context

Mobile-only PWA for real-world hide and seek. This file is the persistent source of truth
across build phases. **Update the Phase Checklist at the end of every phase.**

## Execution Protocol

- Build in 6 sequential phases. Finish one phase, verify (typecheck / lint / SQL), summarize,
  then **stop and wait for the user to say "Proceed to Phase N"**.
- Never start the next phase unprompted.

---

## Architecture

```
/                       npm workspaces root (Node 22 recommended)
├─ apps/web             Next.js 16 (App Router, TS, Tailwind v4, lucide-react, MapLibre GL,
│                       @turf/turf, @supabase/supabase-js, socket.io-client) → Vercel
├─ apps/server          Node + TS + Express + socket.io + @supabase/supabase-js (service role)
│                       + @turf/turf → Render persistent Web Service
├─ packages/shared      Source-only TS: enums, constants, formulas, DB row types, socket
│                       event contracts. Consumed by web (transpilePackages) and server
│                       (bundled by tsup). Single source of truth for game constants.
└─ supabase/migrations  SQL schema, RLS, RPCs
```

### Trust & data-flow model

| Actor | Auth | Can do |
|---|---|---|
| Browser (web) | Supabase **anonymous auth** JWT (`signInAnonymously`) | Calls client-facing RPCs (`create_room`, `join_room`, `claim_lobby_role`, `set_player_ready`, `start_match`, `self_surrender`). Reads `rooms`/`players`/`ping_snapshots` for rooms it belongs to. Hiders may read/write only their **own** `hider_telemetry` row. |
| Render server | `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) | Authoritative game loop, telemetry ingest, ping waves, tags. Calls service-only RPCs (`attempt_proximity_tag`, `confirm_manual_tag`, `transition_room_status`). |
| Socket.io | Client sends Supabase access token in handshake `auth.token`; server verifies with `supabase.auth.getUser(token)` and maps socket → `players` row. To act *as the user* (e.g. host start), the server creates a per-request Supabase client with that JWT so `auth.uid()` RPC checks still apply. |

- Seekers have **zero** read access to `hider_telemetry` (no RLS policy grants it; not in the
  Realtime publication).
- Tag results never contain distance telemetry. Clients only ever see result codes.
- Next ping time is held only in server memory; hiders get a private `PRE_PING_WARNING` 10 s
  before each wave.

### Realtime channels
- Supabase Realtime (postgres_changes) on `rooms`, `players`, `ping_snapshots` for lobby/roster
  sync and ping history.
- Socket.io room `room:{roomId}` for broadcast events; `room:{roomId}:hiders` and
  `room:{roomId}:seekers` for role-scoped events; per-player socket for private events
  (`FORCE_GPS_FLUSH`, `PRE_PING_WARNING`, `TAG_REQUEST`).

---

## Room State Machine

`LOBBY → HEAD_START → ACTIVE → ENDED`

- `LOBBY`: join by 6-char code, claim roles (atomic RPC), GPS-validated Ready toggle.
- `start_match` (host): normal = every member has a role and is ready, ≥1 seeker & ≥1 hider.
  Override (`p_force = true`) = ≥1 ready seeker and ≥1 ready hider; everyone not ready is
  demoted to `UNASSIGNED` (spectator). Sets `head_start_ends_at = now() + head_start_secs`,
  `ends_at = head_start_ends_at + game_duration_mins`.
- `HEAD_START`: seekers see locked countdown; hiders see map + countdown + Stealth toggle.
- `ACTIVE`: hider heartbeats every 10 s; server ping loop; tagging.
- `ENDED`: all hiders caught → `SEEKERS` win; `ends_at` reached → `HIDERS` win.
  Host abort → `ENDED` with `winner = null`.

---

## Database Schema (`supabase/migrations/0001_init_hide_and_seek.sql`)

Enums: `room_status (LOBBY, HEAD_START, ACTIVE, ENDED)`, `player_role (UNASSIGNED, HIDER, SEEKER)`,
`match_winner (HIDERS, SEEKERS)`, `catch_method (PROXIMITY, SELF_SURRENDER, TAG_REQUEST)`.

**rooms**: `id uuid pk`, `code char(6) unique`, `host_user_id uuid`, `status`, `max_players`,
`seeker_count`, `game_duration_mins`, `head_start_secs`, `ping_interval_min_secs`,
`ping_interval_max_secs`, `geofence jsonb` (GeoJSON Polygon), `geofence_buffered jsonb`
(12 m buffer, Polygon|MultiPolygon), `geofence_area_m2`, `head_start_ends_at`, `started_at`,
`ends_at`, `ended_at`, `winner`, `ping_wave_count`, `created_at`, `updated_at`.

**players**: `id uuid pk`, `room_id fk`, `user_id uuid` (auth.uid), `display_name`, `role`,
`is_host`, `is_ready`, `ready_checked_at`, `caught_at`, `caught_by_player_id`, `catch_method`,
`catches_count`, `last_failed_tag_at`, `exposed_until`, `out_of_bounds_since`, `last_seen_at`,
`joined_at`. Unique `(room_id, user_id)`.

**hider_telemetry** (latest fix per hider, upsert): `player_id pk fk`, `room_id`, `lat`, `lng`,
`accuracy_m`, `battery`, `updated_at`. RLS: owner-hider only. Never in Realtime publication.

**ping_snapshots**: `id`, `room_id`, `wave_number`, `player_id` (hider), `lat`, `lng`,
`accuracy_m`, `stale bool` (heartbeat age > 20 s at snapshot), `heartbeat_at`, `created_at`.
Readable by room members. Written by server only.

**tag_attempts** (audit, service-only — no RLS policies): `seeker_player_id`, `hider_player_id`,
`result`, `counts_as_strike`, `d_raw_m`, `d_discount_m`, `d_effective_m`, `hider_fix_age_s`,
`created_at`. Feeds the 2-strikes-in-60 s rule (missing hider telemetry costs the cooldown but is
not a strike).

`attempt_proximity_tag` returns jsonb `{ result: TAGGED|OUT_OF_RANGE|COOLDOWN|NEEDS_FRESH_FIX|INVALID,
cooldown_until?, tag_request_eligible?, exposure_triggered?, exposed_until?, match_ended?, winner? }`.
The server must strip `exposure_triggered`/`exposed_until` before acking the seeker. RPC errors are
raised as plain-message codes (`ROLE_FULL`, `OUTSIDE_PLAY_ZONE`, `NOT_HOST`, …).

### RPCs
| Function | Caller | Purpose |
|---|---|---|
| `create_room(...)` | authenticated | Validates rules + geofence, generates unique code, inserts host player. |
| `join_room(code, name)` | authenticated | Joins LOBBY as `UNASSIGNED` (idempotent). |
| `claim_lobby_role(room_id, role)` | authenticated | `FOR UPDATE` on room row; enforces `seeker_count` / `max_players - seeker_count`. |
| `set_player_ready(room_id, ready, lat, lng, accuracy_m)` | authenticated | Ready requires role ≠ UNASSIGNED, accuracy ≤ 30 m, point inside `geofence_buffered`. |
| `start_match(room_id, force)` | authenticated host | LOBBY → HEAD_START. Ready only counts if `ready_checked_at` < 120 s old (0002). |
| `leave_room(room_id)` | authenticated | Leave LOBBY; host passes to earliest joiner; empty room deleted (0002). |
| `self_surrender(room_id)` | authenticated hider | Marks caller caught (`SELF_SURRENDER`). |
| `attempt_proximity_tag(...)` | service_role | Option C proximity check (below). |
| `confirm_manual_tag(room, seeker, hider)` | service_role | Hider accepted a manual Tag Request. |
| `record_ping_wave(room)` | service_role | Atomically bumps `ping_wave_count` and snapshots uncaught hiders (`stale` if fix > 20 s). |
| `transition_room_status(room, from, to, winner)` | service_role | Compare-and-set state transitions. |
| `haversine_m`, `point_in_geojson` | internal | Math helpers. |

---

## Mathematical Formulas & Constants (mirrored in `packages/shared/src/constants.ts`)

- Earth radius `R = 6 371 008.8 m` (matches Turf).
- **Haversine**: `a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)`, `d_raw = 2R · atan2(√a, √(1−a))`.
- **Accuracy discount**: `d_discount = min(σ_seeker + σ_hider, 20.0 m)` (σ clamped ≥ 0).
- **Effective distance**: `d_effective = max(0, d_raw − d_discount)`.
- **Tag succeeds** iff `d_effective ≤ 15.0 m`.
- **Fresh-fix required** (server emits `FORCE_GPS_FLUSH`, waits 2 s, retries once) iff
  hider heartbeat age > 10 s **or** `15 m < d_effective ≤ 40 m`.
- Failed tag → generic `OUT_OF_RANGE`, seeker locked 20 s (`last_failed_tag_at`).
- 2 failed tags within 60 s → seeker exposed to hiders for 30 s (`exposed_until`).
- Dispute fallback: after a failed tag or hider telemetry > 30 s stale, seeker may send a
  "Tag Request" → 15 s confirm modal on hider.
- Geofence: `turf.kinks` must be empty; area via `turf.area`; circle mode = `turf.circle(center,
  r, { steps: 64 })`; drift buffer = `turf.buffer(geofence, 0.012, { units: 'kilometers' })`.
- Out of bounds: hider outside buffered fence continuously for 15 s → penalty / alert.
- Ready check: accuracy ≤ 30 m and inside buffered fence.
- Heartbeat interval 10 s; ping snapshot `stale` if heartbeat age > 20 s.
- Ping scheduler delay `U(min_ping_s, max_ping_s)`, × 0.75 when < 10 min remaining.
  Pre-ping hider haptic warning 10 s before each wave (`navigator.vibrate([200,100,200])`).
- Seeker ping rendering: circle radius `max(accuracy_m, 10)`; opacity latest 100 %, N-1 50 %,
  N-2 20 %, older hidden.

---

## Conventions

- TypeScript strict everywhere. Shared enums/constants come from `@hideseek/shared` — never
  hard-code game numbers in apps.
- Server env validated with zod at boot. Server passes `ws` as the Supabase Realtime transport
  (Node < 22 has no global WebSocket). Use Node 22 (`.nvmrc`); Node 20 is EOL. Web only uses `NEXT_PUBLIC_*` vars.
- Maps: MapLibre GL (no token needed; style URL via `NEXT_PUBLIC_MAP_STYLE_URL`).
- Next.js 16 has breaking changes vs older versions — read `apps/web/node_modules/next/dist/docs/`
  before writing Next-specific code (see `apps/web/AGENTS.md`).
- Commands (from root): `npm run typecheck`, `npm run lint`, `npm test`, `npm run dev:web`,
  `npm run dev:server`.

---

## Server (`apps/server`) — Phase 2

```
src/index.ts            boot (env, logger, SupabaseGameStore, SIGTERM shutdown)
src/app.ts              createGameApp(): Express (/healthz) + Socket.io + RoomManager (test-friendly factory)
src/sockets.ts          handshake auth (auth.token = Supabase access token) + event handlers (zod-validated)
src/store/types.ts      GameStore interface (service-role data access + asUser(token) RPCs)
src/store/supabaseStore.ts  Supabase implementation
src/game/RoomManager.ts one RoomRuntime per HEAD_START/ACTIVE room; DB sweep every SWEEP_INTERVAL_MS
src/game/RoomRuntime.ts timers, ping loop, heartbeats, OOB, tagging, tag requests, exposure
src/game/{config,scheduler,geofence}.ts  timing knobs, ping delay math, turf point-in-fence
test/                   vitest: unit + socket.io end-to-end against an in-memory FakeStore
```

- **Single instance.** Runtime state (timers, telemetry cache, pending requests) is in memory; Render
  must run exactly 1 instance. Restarts recover from Postgres via the sweep (ping cadence restarts).
- Sweep also catches transitions made outside sockets (host calling `start_match` RPC directly,
  `self_surrender` via RPC, rooms ended elsewhere).
- Socket channels: `room:{roomId}` (all members), `player:{playerId}` (private). Role-scoped
  emits target player channels explicitly; an empty target list is a no-op (never `io.to([])`).
- Socket events (typed in `packages/shared/src/events.ts`):
  - C→S: `auth:refresh`, `room:join`, `host:start_match`, `hider:heartbeat`, `hider:fresh_fix`,
    `hider:self_surrender`, `hider:tag_request_response`, `seeker:location`, `seeker:tag`,
    `seeker:tag_request`.
  - S→C: `room:status`, `room:state` (private snapshot on join), `ping:wave`, `ping:pre_warning`
    (hiders), `FORCE_GPS_FLUSH` (one hider), `hider:boundary_warning` (one hider),
    `hider:out_of_bounds` / `hider:back_in_bounds`, `hider:caught`, `seeker:exposed` (hiders),
    `tag_request:incoming` (one hider), `tag_request:resolved` (seeker + hider).
- Heartbeat timestamp = `min(client fix time, server now)`; out-of-order fixes dropped; ≥ 2 s
  between heartbeats (fresh-fix replies exempt).
- **Out-of-bounds penalty:** leaving the buffered fence → private `hider:boundary_warning` (haptic)
  + `players.out_of_bounds_since`. Still outside after 15 s → the hider's live fix is broadcast to
  seekers (`hider:out_of_bounds`) on every heartbeat until they return (`hider:back_in_bounds`).
- **Tag flow:** `attempt_proximity_tag(fresh=false)` → if `NEEDS_FRESH_FIX`: emit `FORCE_GPS_FLUSH`,
  wait ≤ 2 s for `hider:fresh_fix` (skipped if hider offline) → `attempt_proximity_tag(fresh=true)`.
  Ack is stripped to `{ result, cooldownUntil?, tagRequestEligible? }`. One tag in flight per seeker.
  Exposure → `seeker:exposed` to hiders, refreshed on each `seeker:location` until it expires.
- **Tag request:** eligible if that seeker failed a tag on that hider in the last 60 s, or the
  hider's fix is > 30 s old / missing. One pending per seeker and per hider; 15 s to answer;
  declined/expired → 20 s before the same seeker can re-request that hider.
- Errors returned to clients are SQL raise codes only (`/^[A-Z_]+$/`), otherwise `INTERNAL`.
- Logs are single-line JSON and never include coordinates.

---

## Web (`apps/web`) — Phase 3

```
app/layout.tsx            viewport (no zoom, #000 theme, viewport-fit=cover) + <Providers>
app/manifest.ts           PWA manifest (standalone, portrait, icons in public/)
app/providers.tsx         SessionProvider → SocketProvider
app/page.tsx              landing: name, join by 6-char code (join_room RPC), host → /room/create
app/room/create/          geofence builder (client-only via next/dynamic ssr:false)
app/room/[code]/page.tsx  placeholder (Phase 4 lobby)
components/GeofenceBuilder.tsx  pin-drop polygon / quick circle, kinks + area, rules sliders, create_room
components/map/           useMaplibre hook, GeoJSON layer helpers, marker DOM elements
lib/                      supabase singleton + ensureSession (anonymous auth), session/socket providers,
                          rpc wrappers, geofence math (vitest), friendlyError, useGeolocation
```

- **MapLibre v6 worker:** loaded from `/vendor/maplibre-gl-worker.mjs`, copied by
  `scripts/copy-maplibre-worker.mjs` on `predev`/`prebuild` (gitignored). `.maplibregl-map` forces
  `position: relative` — size map containers through a wrapper element.
- Maps: rotation/pitch disabled; attribution compact top-left; bottom sheets set `map.setPadding`
  so the logical center stays visible. Dev builds expose `window.__hsMap` for manual QA.
- Socket: connects only once a Supabase session exists; token read fresh on every reconnect
  (`auth` callback) and pushed via `auth:refresh` on rotation.
- Next 16 + `cacheComponents`: routes stay mounted under `<Activity>` (effects cleaned up when
  hidden). Async `params` must be awaited inside `<Suspense>`. React-hooks lint forbids
  synchronous `setState` in effects — derive state or use `useSyncExternalStore`.
- Builder limits: area 2 000 m² – 50 km², ≤ 200 pins, circle radius 50–1500 m.
- `.claude/launch.json` defines `web` (:3000) and `server` (:4000) dev servers.

---

## Lobby (`/room/[code]`) — Phase 4

- `components/room/RoomScreen.tsx` switches on load phase and `room.status`: name prompt (deep
  link without a saved name) → `Lobby` (LOBBY) → `MatchScreen` (HEAD_START / ACTIVE / ENDED).
- `lib/useRoom.ts`: `join_room` (idempotent) → fetch room + players; Supabase Realtime
  `postgres_changes` on `players` (room filter → debounced refetch) and `rooms` (UPDATE), plus a
  10 s poll + refetch on tab focus (Realtime can drop DELETEs / disconnect on mobile). Joins the
  socket room and refetches on `room:status`. Actions return `string | null` (friendly error).
- Start match goes through the socket (`host:start_match`) so the server spins up the runtime
  immediately; falls back to the `start_match` RPC when the socket is down (server sweep catches it).
- `lib/zone.ts` + `GpsBadge`: inside / outside / inaccurate (> 30 m) / locating / denied.
- `lib/useReadyGuard.ts`: auto-cancels Ready when leaving the zone or losing accuracy; while ready
  and inside, re-sends `set_player_ready(true, fix)` every 30 s (`READY_REFRESH_MS`) so the
  120 s freshness check in `start_match` passes.
- `/dev/lobby` — dev-only fixture (404 in production) to QA the lobby without Supabase; click
  "Mount lobby fixture" after stubbing `navigator.geolocation`.
- SQL tests live in `supabase/tests/rpc.test.mjs` (PGlite, all migrations) — `npm run test:sql`;
  root `npm test` runs SQL + workspace suites.
- Layout gotchas: scroll containers inside flex columns need `min-h-0`, and their children
  `shrink-0`; full-screen maps add the `hs-fullscreen-map` class (attribution offset).

---

## Match views — Phase 5

```
components/match/MatchScreen.tsx   role/status router; owns GPS watch, wake lock, telemetry, useMatch
  HeadStartSeeker                  locked full-screen countdown (no map)
  HiderView                        map (own pings + exposed-seeker markers), OOB/exposure banners,
                                   Stealth Pocket Mode, slide-to-surrender (ACTIVE only), TagRequestModal
  SeekerView (+ spectator)         radar: fading ping circles, OOB hider live markers, TagDrawer
  MatchMap                         zone + my dot + "pings" fill/line layers + pulsing DOM markers
  StealthOverlay                   #000 z-60, swallows touches, double-tap → dim slide-to-unlock (5 s)
  TagRequestModal                  z-70 (above stealth), 15 s countdown, accept/decline
  TagDrawer                        "Tag [name]" per uncaught hider, shared 20 s lock, tag-request link
lib/useMatch.ts        socket → waves (last 3), exposures, OOB, incoming/outgoing tag requests,
                       cooldown, toasts, haptics; actions tag / requestTag / answerTagRequest / surrender
lib/useHiderTelemetry  heartbeat every 10 s (+ first fix immediately); FORCE_GPS_FLUSH →
                       getCurrentPosition(maximumAge 0) → "hider:fresh_fix" (fallback: watched fix < 5 s)
                       useSeekerBeacon: seeker:location every 3 s (server uses it while exposed)
lib/useWakeLock        screen wake lock for the whole live match; re-acquired on visibilitychange
lib/haptics            navigator.vibrate guard (no-op on iOS Safari)
```

- Ping rendering: radius `max(accuracy_m, 10)`, opacity 1 / 0.5 / 0.2 by wave age, stale = amber.
  Hiders only see their own pings; seekers + spectators see all uncaught hiders.
- Banners and toasts render as children of `<Hud>` so they stack instead of overlapping.
  `isEndgame(room, now)` drives the "final 10 min" line (from `ends_at`, ACTIVE only).
- Server change: `seeker:exposed` now also goes to the exposed seeker; `room:state` includes the
  seeker's own exposure.
- `/dev/match` — dev-only fixture (404 in prod) with a FakeSocket + QA panel (fire pings, warnings,
  OOB, exposure, tag request, go ACTIVE, end). Stub `navigator.geolocation` before picking a role.
- Next 16 `cacheComponents` flags `Date.now()` evaluated during prerender in client components —
  keep clock reads in effects/handlers or in trees that only render after client data loads.

---

## Post-match & deployment — Phase 6

- `components/summary/MatchSummary.tsx` (ENDED): winner banner (+ "You won!"), ping replay
  (`ReplayMap`: per-hider coloured trails up to the selected wave + that wave's accuracy circles;
  play/pause/scrub), hider survival leaderboard (survivors first, survival measured from
  `head_start_ends_at` to `caught_at` / `ended_at`), seeker catch counts. Data helpers in
  `lib/summary.ts` (`buildResults`, `groupWaves`, unit-tested). Ping history loads from
  `ping_snapshots`; `MatchScreen` accepts a `loadPingHistory` override (used by `/dev/match`).
- `render.yaml` (Blueprint): 1 instance, `starter` plan (free plan sleeps → kills matches),
  workspace-scoped `npm ci --include=dev`, tsup build, `node apps/server/dist/index.js`,
  `/healthz` health check, build filter on server/shared paths. Secrets are `sync: false`.
- `apps/web/vercel.json`: Vercel project Root Directory = `apps/web`; install runs at the repo root;
  immutable cache for `/vendor/*`; Permissions-Policy allows geolocation + screen-wake-lock.
- MapLibre worker is copied as `maplibre-gl-worker-<version>.mjs` and loaded via
  `setWorkerUrl("/vendor/maplibre-gl-worker-" + getVersion() + ".mjs")`.
- `CORS_ORIGINS` supports one-label wildcards (`https://*.vercel.app`) — `apps/server/src/origins.ts`.
- Verified: `tsc --noEmit` per package, lint, SQL (43) + server (24) + web (8) tests, both builds,
  and clean-checkout simulations of the Render and Vercel build commands.

---

## Phase Checklist

- [x] **Phase 1** — Monorepo scaffold, `CLAUDE.md`, Supabase SQL layer (tables, RLS, RPCs).
- [x] **Phase 2** — Render backend: Express + Socket.io + Supabase admin; room loop (HEAD_START →
      ACTIVE → ENDED, random pings w/ 0.75× endgame, 10 s pre-ping warning); heartbeat ingest +
      15 s out-of-bounds check; tag orchestration (FORCE_GPS_FLUSH 2 s handshake, 2-strike
      exposure, manual tag request).
- [x] **Phase 3** — Web PWA core: viewport/manifest (#000 theme, no zoom), Supabase + Socket
      providers, landing page (create / join by code + name), `/room/create` geofence builder
      (pin-drop polygon w/ drag + undo, quick circle, kinks validation, live area, rule sliders).
- [x] **Phase 4** — `/room/[code]` lobby: Unassigned/Hider/Seeker columns live, atomic claim,
      GPS boundary badge, Ready toggle, host Start / Force Roster Override.
- [x] **Phase 5** — Active views: HEAD_START overlay; Hider UI (map, seeker penalty markers,
      Stealth Pocket Mode w/ wakeLock + blackout + double-tap/slide unlock + haptics,
      slide-to-surrender, accept tag request); Seeker radar (fading ping circles, OOB alerts,
      tag drawer w/ 20 s cooldown, Send Tag Request fallback).
- [x] **Phase 6** — ENDED summary (winner, survival leaderboard, catch counts, ping replay);
      `render.yaml`, `vercel.json`; `tsc --noEmit` across apps.
