/**
 * Dev-only: game server on :4000 backed by the in-memory FakeStore, with seeded rooms and
 * simulated players (hider heartbeats + seeker beacons) — for UI QA of the referee console
 * without Supabase. Admin password in this mode: "dev-admin".
 *   npm run dev:fake -w @hideseek/server
 */
import { io as connect } from "socket.io-client";
import { createGameApp } from "../src/app";
import { createLogger } from "../src/log";
import { FakeStore } from "./fakeStore";

const PORT = Number(process.env.PORT ?? 4000);
const store = new FakeStore();
const app = createGameApp({
  store,
  log: createLogger("info"),
  corsOrigins: ["http://localhost:3000"],
  config: { heartbeatMinIntervalMs: 0, seekerLocationMinIntervalMs: 0 },
  adminPasswordCheck: (pw) => pw === "dev-admin",
});

// Rooms around Central Park's Great Lawn.
const at = (dLat: number, dLng: number) => ({ lat: 40.7829 + dLat, lng: -73.9654 + dLng });
// FakeStore rooms are centred on (40, -74); move them onto the park.
const D_LNG = -73.9654 + 74;
const D_LAT = 40.7829 - 40;
const moveRing = (ring: number[][]) => ring.map(([lng, lat]) => [lng! + D_LNG, lat! + D_LAT] as [number, number]);
const shift = (r: ReturnType<FakeStore["createRoom"]>) => {
  r.geofence.coordinates = r.geofence.coordinates.map(moveRing);
  if (r.geofence_buffered.type === "Polygon") r.geofence_buffered.coordinates = r.geofence_buffered.coordinates.map(moveRing);
};

const lobby = store.createRoom({ code: "LOBBY1", ping_interval_min_secs: 60, ping_interval_max_secs: 120 });
shift(lobby);
store.addPlayer(lobby.id, "Host Hal", "SEEKER", { host: true });
store.addPlayer(lobby.id, "Ivy", "HIDER");
store.addPlayer(lobby.id, "Jo", "UNASSIGNED");

const live = store.createRoom({ code: "LIVE42", ping_interval_min_secs: 45, ping_interval_max_secs: 90, created_at: new Date(Date.now() + 1000).toISOString() });
shift(live);
store.activate(live.id, 25 * 60);
const hiders = ["Bea", "Dmitri", "Noor"].map((n) => store.addPlayer(live.id, n, "HIDER"));
const seekers = ["Sam", "Cy"].map((n) => store.addPlayer(live.id, n, "SEEKER"));
store.players.get(hiders[2]!.player.id)!.caught_at = new Date().toISOString();
store.players.get(seekers[0]!.player.id)!.catches_count = 1;

const ended = store.createRoom({ code: "DONE77", created_at: new Date(Date.now() - 3600_000).toISOString() });
shift(ended);
Object.assign(store.rooms.get(ended.id)!, { status: "ENDED", winner: "HIDERS", ended_at: new Date().toISOString() });

app.httpServer.listen(PORT, async () => {
  console.log(`[dev-fake] http://localhost:${PORT}  (admin password: dev-admin)`);
  await app.manager.start(2000);
  const url = `http://localhost:${PORT}`;
  const sock = async (token: string) => {
    const s = connect(url, { auth: { token }, transports: ["websocket"] });
    await new Promise<void>((r) => s.once("connect", () => r()));
    await s.emitWithAck("room:join", { roomId: live.id });
    return s;
  };
  const hs = await Promise.all(hiders.slice(0, 2).map((h) => sock(h.token)));
  const ss = await Promise.all(seekers.map((k) => sock(k.token)));
  let t = 0;
  setInterval(() => {
    t += 1;
    hs.forEach((s, i) => {
      // Dmitri wanders out of bounds every ~minute to exercise the OOB flag.
      const out = i === 1 && t % 20 > 12;
      const p = out ? at(0.0035, 0) : at(Math.sin(t / 8 + i) * 0.0008, Math.cos(t / 10 + i) * 0.0009);
      s.emit("hider:heartbeat", { ...p, accuracy_m: 6 + i * 5, battery: 0.9 - i * 0.3, updated_at: new Date().toISOString() });
    });
    ss.forEach((s, i) => {
      const p = at(Math.cos(t / 9 + i * 2) * 0.0007, Math.sin(t / 7 + i) * 0.0008);
      s.emit("seeker:location", { ...p, accuracy_m: 9 });
    });
  }, 3000);
});
