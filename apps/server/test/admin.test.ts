import { afterEach, describe, expect, it } from "vitest";
import type { AdminRoomDetail, AdminRoomSummary } from "@hideseek/shared";
import { verifyAdminPassword } from "../src/admin/credentials";
import { CENTER } from "./fakeStore";
import { heartbeat, join, next, sleep, startServer } from "./harness";

type Server = Awaited<ReturnType<typeof startServer>>;
let server: Server | null = null;
afterEach(async () => {
  await server?.stop();
  server = null;
});

async function boot() {
  server = await startServer();
  const base = `http://localhost:${server.port}/admin`;
  const call = (path: string, init: RequestInit & { token?: string } = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
    });
  const login = async (password = "test-admin-pw") => {
    const r = await call("/login", { method: "POST", body: JSON.stringify({ password }) });
    return { status: r.status, body: (await r.json()) as { token?: string; error?: string } };
  };
  return { ...server, call, login };
}

describe("admin auth", () => {
  it("rejects wrong passwords and unauthenticated calls; accepts the right one", async () => {
    const s = await boot();
    expect((await s.login("nope")).status).toBe(401);
    expect((await s.call("/rooms")).status).toBe(401);
    expect((await s.call("/rooms", { token: "forged.token" })).status).toBe(401);
    const ok = await s.login();
    expect(ok.status).toBe(200);
    expect((await s.call("/session", { token: ok.body.token })).status).toBe(200);
  });

  it("rate-limits repeated failures", async () => {
    const s = await boot();
    const codes = [];
    for (let i = 0; i < 9; i++) codes.push((await s.login("wrong")).status);
    expect(codes.slice(0, 8).every((c) => c === 401)).toBe(true);
    expect(codes[8]).toBe(429);
  });

  it("the hardcoded credential rejects wrong / empty / oversized input", () => {
    expect(verifyAdminPassword("")).toBe(false);
    expect(verifyAdminPassword("password")).toBe(false);
    expect(verifyAdminPassword("x".repeat(500))).toBe(false);
  });
});

describe("admin rooms", () => {
  it("lists rooms and shows live positions (hider telemetry + seeker beacon) for an active match", async () => {
    const s = await boot();
    const room = s.store.createRoom();
    s.store.activate(room.id);
    const h = s.store.addPlayer(room.id, "Hana", "HIDER");
    const k = s.store.addPlayer(room.id, "Sam", "SEEKER");
    const hider = await s.client(h.token);
    const seeker = await s.client(k.token);
    await join(hider, room.id);
    await join(seeker, room.id);
    heartbeat(hider, { ...CENTER, accuracy_m: 7 });
    seeker.emit("seeker:location", { lat: 40.0005, lng: -74, accuracy_m: 9 });
    await sleep(100);

    const { body } = await s.login();
    const list = (await (await s.call("/rooms", { token: body.token })).json()) as AdminRoomSummary[];
    expect(list[0]).toMatchObject({ id: room.id, status: "ACTIVE", live: true, hiders: 1, hidersLeft: 1, seekers: 1 });

    const detail = (await (await s.call(`/rooms/${room.id}`, { token: body.token })).json()) as AdminRoomDetail;
    expect(detail.players).toHaveLength(2);
    expect(detail.nextPingAt).toBeTruthy();
    const bySource = Object.fromEntries(detail.positions.map((p) => [p.source, p]));
    expect(bySource.telemetry).toMatchObject({ playerId: h.player.id, accuracy_m: 7 });
    expect(bySource.beacon).toMatchObject({ playerId: k.player.id, accuracy_m: 9 });
  });

  it("ends a live match and notifies players", async () => {
    const s = await boot();
    const room = s.store.createRoom();
    s.store.activate(room.id);
    const h = s.store.addPlayer(room.id, "Hana", "HIDER");
    const hider = await s.client(h.token);
    await join(hider, room.id);
    const { body } = await s.login();
    const ended = next(hider, "room:status", (st) => st.status === "ENDED");
    const r = await s.call(`/rooms/${room.id}/end`, { method: "POST", token: body.token, body: JSON.stringify({ winner: null }) });
    expect(r.status).toBe(200);
    expect((await ended).winner).toBeNull();
    expect(s.store.rooms.get(room.id)!.status).toBe("ENDED");
    const again = await s.call(`/rooms/${room.id}/end`, { method: "POST", token: body.token, body: JSON.stringify({ winner: null }) });
    expect(again.status).toBe(409);
  });

  it("kicks lobby players but never the host or mid-match", async () => {
    const s = await boot();
    const room = s.store.createRoom();
    const host = s.store.addPlayer(room.id, "Host", "UNASSIGNED", { host: true });
    const guest = s.store.addPlayer(room.id, "Guest", "HIDER");
    const { body } = await s.login();
    const kick = (pid: string) => s.call(`/rooms/${room.id}/players/${pid}`, { method: "DELETE", token: body.token });

    expect((await kick(host.player.id)).status).toBe(409);
    expect((await kick(guest.player.id)).status).toBe(200);
    expect(s.store.players.has(guest.player.id)).toBe(false);

    s.store.activate(room.id);
    expect((await kick(host.player.id)).status).toBe(409);
  });
});
