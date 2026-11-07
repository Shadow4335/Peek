// SQL-layer tests: applies every migration to an in-memory Postgres (PGlite) with
// Supabase auth/role stubs, then exercises RLS and RPCs. Run: npm run test:sql
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const migrations = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(dir, f), "utf8"));
const db = new PGlite();

// --- Supabase stubs ---
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create publication supabase_realtime;
`);
for (const m of migrations) await db.exec(m);
console.log(`${migrations.length} migration(s) applied`);

const U = {
  host: "00000000-0000-0000-0000-00000000000a",
  b: "00000000-0000-0000-0000-00000000000b",
  c: "00000000-0000-0000-0000-00000000000c",
  d: "00000000-0000-0000-0000-00000000000d",
};

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${msg}`); };

async function as(uid, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  await db.exec(uid === "service" ? "set role service_role" : "set role authenticated");
  try { return (await db.query(sql, params)).rows; }
  finally { await db.exec("reset role"); }
}
async function expectErr(uid, sql, params, code, label) {
  try { await as(uid, sql, params); ok(false, `${label} (expected ${code}, got success)`); }
  catch (e) { ok(e.message.includes(code), `${label} → ${e.message}`); }
}

// Square ~200m around (40.0, -74.0)
const d = 0.0009;
const fence = { type: "Polygon", coordinates: [[[-74 - d, 40 - d], [-74 + d, 40 - d], [-74 + d, 40 + d], [-74 - d, 40 + d], [-74 - d, 40 - d]]] };
const bd = d + 0.00012;
const buffered = { type: "Polygon", coordinates: [[[-74 - bd, 40 - bd], [-74 + bd, 40 - bd], [-74 + bd, 40 + bd], [-74 - bd, 40 + bd], [-74 - bd, 40 - bd]]] };

const [room] = await as(U.host,
  `select * from create_room('Host', 3, 1, 30, 60, 60, 120, $1::jsonb, $2::jsonb, 40000)`,
  [JSON.stringify(fence), JSON.stringify(buffered)]);
ok(/^[A-Z2-9]{6}$/.test(room.code), `create_room code ${room.code}`);
const R = room.id;

await expectErr(U.host, `select * from create_room('X', 3, 3, 30, 60, 60, 120, $1::jsonb, $2::jsonb, 1)`,
  [JSON.stringify(fence), JSON.stringify(buffered)], "seekers_lt_max", "seeker_count < max_players enforced");
await expectErr(null, `select * from join_room($1, 'Anon')`, [room.code], "NOT_AUTHENTICATED", "join requires auth");

const [pb] = await as(U.b, `select * from join_room($1, 'Bea')`, [room.code.toLowerCase()]);
const [pc] = await as(U.c, `select * from join_room($1, 'Cy')`, [room.code]);
ok(pb.role === "UNASSIGNED", "join lands in UNASSIGNED");
await expectErr(U.d, `select * from join_room($1, 'Dee')`, [room.code], "ROOM_FULL", "max_players caps joins");
const again = await as(U.b, `select * from join_room($1, 'Bea')`, [room.code]);
ok(again[0].id === pb.id, "rejoin is idempotent");

// Roles: seeker cap 1, hider cap 2
await as(U.b, `select * from claim_lobby_role($1, 'SEEKER')`, [R]);
await expectErr(U.c, `select * from claim_lobby_role($1, 'SEEKER')`, [R], "ROLE_FULL", "seeker slot cap");
await as(U.c, `select * from claim_lobby_role($1, 'HIDER')`, [R]);
await as(U.host, `select * from claim_lobby_role($1, 'HIDER')`, [R]);
await expectErr(U.b, `select * from claim_lobby_role($1, 'HIDER')`, [R], "ROLE_FULL", "hider slot cap (max - seekers)");

// Ready checks
await expectErr(U.c, `select * from set_player_ready($1, true, 40, -74, 45)`, [R], "GPS_ACCURACY_TOO_LOW", "ready needs accuracy <= 30");
await expectErr(U.c, `select * from set_player_ready($1, true, 40.01, -74, 5)`, [R], "OUTSIDE_PLAY_ZONE", "ready needs inside fence");
const [rdyBuf] = await as(U.c, `select * from set_player_ready($1, true, $2, -74, 5)`, [R, 40 + d + 0.00008]);
ok(rdyBuf.is_ready, "ready allowed inside 12m drift buffer (outside raw fence)");
await as(U.b, `select * from set_player_ready($1, true, 40, -74, 5)`, [R]);

await expectErr(U.b, `select * from start_match($1)`, [R], "NOT_HOST", "only host can start");
await expectErr(U.host, `select * from start_match($1, false)`, [R], "ROSTER_NOT_READY", "normal start needs all ready");

// 0002: stale GPS check no longer counts as ready
await as("service", `update players set ready_checked_at = now() - interval '3 minutes' where user_id = $1`, [U.b]);
await expectErr(U.host, `select * from start_match($1, true)`, [R], "NEED_READY_SEEKER_AND_HIDER", "stale ready (>120s) is not ready");
const [bAfter] = await as("service", `select is_ready from players where user_id = $1`, [U.b]);
ok(bAfter.is_ready === true, "failed start rolls back the stale-ready reset");
await as(U.b, `select * from set_player_ready($1, true, 40, -74, 5)`, [R]);

// RLS: telemetry invisible to everyone pre-match / seekers
const seekerRooms = await as(U.b, `select * from rooms`);
ok(seekerRooms.length === 1, "member can read own room");
const dRooms = await as(U.d, `select * from rooms`);
ok(dRooms.length === 0, "non-member cannot read room");

const [started] = await as(U.host, `select * from start_match($1, true)`, [R]);
ok(started.status === "HEAD_START" && started.ends_at, "force start → HEAD_START");
const [hostAfter] = await as("service", `select role from players where user_id = $1`, [U.host]);
ok(hostAfter.role === "UNASSIGNED", "force start demotes unready players");

// Hider telemetry RLS
await as(U.c, `insert into hider_telemetry (player_id, room_id, lat, lng, accuracy_m, updated_at) values ($1, $2, 40, -74, 5, now() + interval '1 hour')`, [pc.id, R]);
const [own] = await as(U.c, `select * from hider_telemetry`);
ok(own && new Date(own.updated_at) <= new Date(Date.now() + 5000), "hider writes own telemetry; future timestamp clamped");
const seekerTel = await as(U.b, `select * from hider_telemetry`);
ok(seekerTel.length === 0, "SEEKER reads zero hider_telemetry rows");
await expectErr(U.b, `insert into hider_telemetry (player_id, room_id, lat, lng, accuracy_m) values ($1, $2, 1, 1, 1)`, [pb.id, R], "row-level security", "seeker cannot write telemetry");
await expectErr(U.b, `update players set role = 'HIDER'`, [], "permission denied", "no direct player DML");
await expectErr(U.b, `select * from tag_attempts`, [], "permission denied", "tag_attempts hidden from clients");
await expectErr(U.b, `select attempt_proximity_tag($1,$2,$3,40,-74,5)`, [R, pb.id, pc.id], "permission denied", "tag RPC is service-only");

const [act] = await as("service", `select * from transition_room_status($1, 'HEAD_START', 'ACTIVE')`, [R]);
ok(act.status === "ACTIVE", "CAS HEAD_START → ACTIVE");
const [cas2] = await as("service", `select (transition_room_status($1, 'HEAD_START', 'ACTIVE')).id`, [R]);
ok(cas2.id === null, "CAS fails when state already moved");

// Ping wave
await as("service", `update hider_telemetry set updated_at = now() - interval '25 seconds'`);
const wave = await as("service", `select * from record_ping_wave($1)`, [R]);
ok(wave.length === 1 && wave[0].wave_number === 1 && wave[0].stale === true, "ping wave snapshots hider, stale > 20s");
const seekerWave = await as(U.b, `select * from ping_snapshots`);
ok(seekerWave.length === 1, "seeker reads ping_snapshots");

// Tagging. 1 deg lat ≈ 111195 m.
const m = (meters) => 40 + meters / 111195;
const tag = async (seekerDistM, acc, fresh = false) =>
  (await as("service", `select attempt_proximity_tag($1,$2,$3,$4,-74,$5,$6) as r`, [R, pb.id, pc.id, m(seekerDistM), acc, fresh]))[0].r;

let r = await tag(0, 5);
ok(r.result === "NEEDS_FRESH_FIX", "stale (>10s) hider fix → NEEDS_FRESH_FIX");
await as("service", `update hider_telemetry set updated_at = now(), accuracy_m = 5`);
r = await tag(45, 5);   // raw 45, disc 10, eff 35 → borderline
ok(r.result === "NEEDS_FRESH_FIX", "borderline eff 35m → NEEDS_FRESH_FIX");
r = await tag(45, 5, true);
ok(r.result === "OUT_OF_RANGE" && !("d_raw_m" in r) && r.tag_request_eligible && !r.exposure_triggered, "fail → generic OUT_OF_RANGE, no distance");
r = await tag(0, 5, true);
ok(r.result === "COOLDOWN", "20s cooldown after failure");
await as("service", `update players set last_failed_tag_at = now() - interval '21 seconds' where id = $1`, [pb.id]);
r = await tag(100, 5, true);
ok(r.result === "OUT_OF_RANGE" && r.exposure_triggered === true, "2 strikes in 60s → exposure");
const [exp] = await as("service", `select exposed_until > now() + interval '25 seconds' as e from players where id = $1`, [pb.id]);
ok(exp.e, "exposed_until ≈ now + 30s");
await as("service", `update players set last_failed_tag_at = null where id = $1`, [pb.id]);
// 0004/0005: 3 ft after a discount capped at 5.0856 m ⇒ 6 m raw max.
// raw 6.5 with ±15 m fixes: disc capped 5.0856, eff ≈ 1.41 m → miss (fresh fix already attempted)
await as("service", `update hider_telemetry set accuracy_m = 15`);
r = await tag(6.5, 15, true);
ok(r.result === "OUT_OF_RANGE", "raw 6.5m with big σ → OUT_OF_RANGE (6 m cap)");
await as("service", `update players set last_failed_tag_at = null where id = $1`, [pb.id]);
// raw 5.9, disc capped 5.0856, eff ≈ 0.81 m ≤ 0.9144 m → success
r = await tag(5.9, 15);
ok(r.result === "TAGGED" && r.match_ended === true && r.winner === "SEEKERS", "raw 5.9m (capped discount) → TAGGED, last hider → SEEKERS win");
const [endRoom] = await as("service", `select status, winner from rooms where id = $1`, [R]);
ok(endRoom.status === "ENDED" && endRoom.winner === "SEEKERS", "room ENDED");
const [cnt] = await as("service", `select catches_count from players where id = $1`, [pb.id]);
ok(cnt.catches_count === 1, "seeker catch count incremented");

// 0002: leave_room
const [r2] = await as(U.host, `select * from create_room('Host', 5, 1, 30, 60, 60, 120, $1::jsonb, $2::jsonb, 40000)`,
  [JSON.stringify(fence), JSON.stringify(buffered)]);
await as(U.b, `select * from join_room($1, 'Bea')`, [r2.code]);
await as(U.c, `select * from join_room($1, 'Cy')`, [r2.code]);
await as("service", `update players set joined_at = joined_at + interval '1 second' where user_id = $1 and room_id = $2`, [U.c, r2.id]);
await as(U.host, `select leave_room($1)`, [r2.id]);
const [newHost] = await as("service", `select p.user_id, r.host_user_id from players p join rooms r on r.id = p.room_id where p.room_id = $1 and p.is_host`, [r2.id]);
ok(newHost && newHost.user_id === U.b && newHost.host_user_id === U.b, "host leaving passes host to earliest joiner");
await as(U.c, `select leave_room($1)`, [r2.id]);
await as(U.b, `select leave_room($1)`, [r2.id]);
const gone = await as("service", `select id from rooms where id = $1`, [r2.id]);
ok(gone.length === 0, "last player leaving deletes the room");
await expectErr(null, `select leave_room($1)`, [R], "NOT_AUTHENTICATED", "leave requires auth");
await expectErr(U.b, `select leave_room($1)`, [R], "ROOM_NOT_IN_LOBBY", "cannot leave a started match");

// 0003: rename + rematch
const [r3] = await as(U.host, `select * from create_room('Host', 5, 1, 30, 60, 60, 120, $1::jsonb, $2::jsonb, 40000)`,
  [JSON.stringify(fence), JSON.stringify(buffered)]);
await as(U.b, `select * from join_room($1, 'Bea')`, [r3.code]);
const [renamed] = await as(U.b, `select * from set_display_name($1, '  Sneaky Otter ')`, [r3.id]);
ok(renamed.display_name === "Sneaky Otter", "set_display_name trims and renames in LOBBY");
await expectErr(U.d, `select * from set_display_name($1, 'X')`, [r3.id], "NOT_IN_ROOM", "rename requires membership");
await expectErr(U.b, `select create_rematch($1)`, [r3.id], "ROOM_NOT_ENDED", "rematch only after the match");
await as("service", `select * from transition_room_status($1, 'LOBBY', 'ENDED')`, [r3.id]);
await expectErr(U.b, `select * from set_display_name($1, 'Y')`, [r3.id], "ROOM_NOT_IN_LOBBY", "no renaming after the lobby");
await expectErr(U.d, `select create_rematch($1)`, [r3.id], "NOT_IN_ROOM", "rematch requires membership");
const [{ create_rematch: code1 }] = await as(U.b, `select create_rematch($1)`, [r3.id]);
const [{ create_rematch: code2 }] = await as(U.host, `select create_rematch($1)`, [r3.id]);
ok(/^[A-Z2-9]{6}$/.test(code1) && code1 === code2, "create_rematch is idempotent (first caller wins)", code1);
const [newRoom] = await as("service", `select * from rooms where code = $1`, [code1]);
const [oldRoom] = await as("service", `select * from rooms where id = $1`, [r3.id]);
ok(newRoom.status === "LOBBY" && newRoom.host_user_id === U.b && newRoom.max_players === 5 &&
   JSON.stringify(newRoom.geofence) === JSON.stringify(oldRoom.geofence), "rematch copies zone + rules; caller hosts");
const [oldSeen] = await as(U.host, `select rematch_code from rooms where id = $1`, [r3.id]);
ok(oldSeen.rematch_code === code1, "old room publishes rematch_code to members");
const [hostOfNew] = await as("service", `select display_name, is_host from players where room_id = $1`, [newRoom.id]);
ok(hostOfNew.display_name === "Sneaky Otter" && hostOfNew.is_host, "rematch host keeps their name");

// Math sanity
const [hv] = await as(U.b, `select haversine_m(40,-74,40.001,-74) as d`);
ok(Math.abs(hv.d - 111.195) < 0.01, `haversine 0.001° lat ≈ 111.195 m (${hv.d.toFixed(3)})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
