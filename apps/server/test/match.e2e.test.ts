import { afterEach, describe, expect, it } from "vitest";
import { CENTER, north } from "./fakeStore";
import { autoFlush, heartbeat, join, next, record, sleep, startServer } from "./harness";

type Server = Awaited<ReturnType<typeof startServer>>;
let server: Server | null = null;
afterEach(async () => {
  await server?.stop();
  server = null;
});

const at = (meters: number, accuracy_m = 5) => ({ ...north(meters), accuracy_m });

/** Room already ACTIVE with one seeker and `hiders` hiders, all sockets joined. */
async function activeRoom(hiders = 1, secsLeft = 600) {
  server = await startServer();
  const { store, client } = server;
  const room = store.createRoom();
  store.activate(room.id, secsLeft);
  const s = store.addPlayer(room.id, "Sam", "SEEKER");
  const seeker = await client(s.token);
  await join(seeker, room.id);
  const hs = [];
  for (let i = 0; i < hiders; i++) {
    const h = store.addPlayer(room.id, `Hid${i}`, "HIDER");
    const sock = await client(h.token);
    await join(sock, room.id);
    hs.push({ id: h.player.id, token: h.token, sock });
  }
  return { store, room, seekerId: s.player.id, seeker, hiders: hs };
}

describe("auth", () => {
  it("rejects sockets without a valid Supabase token", async () => {
    server = await startServer();
    await expect(server.client("token-bogus")).rejects.toThrow("UNAUTHORIZED");
  });

  it("refuses room:join for non-members", async () => {
    server = await startServer();
    const room = server.store.createRoom();
    const other = server.store.createRoom();
    const p = server.store.addPlayer(other.id, "X", "HIDER");
    const c = await server.client(p.token);
    const res = await c.emitWithAck("room:join", { roomId: room.id });
    expect(res).toEqual({ ok: false, error: "NOT_IN_ROOM" });
  });
});

describe("state machine + ping loop", () => {
  it("LOBBY → HEAD_START → ACTIVE, pre-ping warning to hiders only, ping wave to everyone", async () => {
    server = await startServer();
    const { store, client } = server;
    const room = store.createRoom();
    const host = store.addPlayer(room.id, "Host", "SEEKER", { host: true });
    const hid = store.addPlayer(room.id, "Hana", "HIDER");
    const seeker = await client(host.token);
    const hider = await client(hid.token);
    await join(seeker, room.id);
    await join(hider, room.id);

    const seekerWarnings = record(seeker, "ping:pre_warning");
    const headStart = next(hider, "room:status", (s) => s.status === "HEAD_START");
    const active = next(seeker, "room:status", (s) => s.status === "ACTIVE");

    // Non-host can't start.
    expect(await hider.emitWithAck("host:start_match", { roomId: room.id, force: true })).toEqual({
      ok: false,
      error: "NOT_HOST",
    });
    expect(await seeker.emitWithAck("host:start_match", { roomId: room.id, force: true })).toEqual({ ok: true });
    expect((await headStart).headStartEndsAt).toBeTruthy();

    heartbeat(hider, { ...CENTER, accuracy_m: 8 });
    await active;
    expect(store.rooms.get(room.id)!.status).toBe("ACTIVE");

    const warning = await next(hider, "ping:pre_warning");
    expect(warning.haptic).toEqual([200, 100, 200]);
    expect(warning.inMs).toBeGreaterThan(0);

    const wave = await next(seeker, "ping:wave");
    expect(wave.waveNumber).toBe(1);
    expect(wave.pings).toHaveLength(1);
    expect(wave.pings[0]).toMatchObject({ playerId: hid.player.id, accuracy_m: 8, stale: false });
    expect(seekerWarnings).toHaveLength(0);
  });

  it("ends with HIDERS winning when the clock runs out", async () => {
    const { seeker, store, room } = await activeRoom(1, 0.6);
    const ended = await next(seeker, "room:status", (s) => s.status === "ENDED");
    expect(ended.winner).toBe("HIDERS");
    expect(store.rooms.get(room.id)!.status).toBe("ENDED");
  });

  it("a reconnecting client gets a room:state snapshot", async () => {
    const { room, hiders } = await activeRoom();
    const again = await server!.client(hiders[0]!.token);
    const snap = next(again, "room:state");
    await join(again, room.id);
    expect((await snap).you).toEqual({ playerId: hiders[0]!.id, role: "HIDER", caught: false });
  });
});

describe("Option C tagging", () => {
  it("borderline tag forces a GPS flush, fails generically, cools down, and 2 strikes never reveal the seeker", async () => {
    const { store, seeker, seekerId, hiders } = await activeRoom();
    const hider = hiders[0]!;
    const flush = autoFlush(hider.sock, () => at(0));
    heartbeat(hider.sock, at(0));
    await sleep(50);

    // 35 m raw − 5.09 m discount ≈ 30 m effective → borderline → flush → still out of range.
    const r1 = await seeker.emitWithAck("seeker:tag", { hiderPlayerId: hider.id, seeker: at(35) });
    expect(flush.count).toBe(1);
    expect(Object.keys(r1).sort()).toEqual(["cooldownUntil", "result", "tagRequestEligible"]);
    expect(r1.result).toBe("OUT_OF_RANGE");

    const r2 = await seeker.emitWithAck("seeker:tag", { hiderPlayerId: hider.id, seeker: at(0) });
    expect(r2.result).toBe("COOLDOWN");

    // Second strike inside 60 s: recorded server-side, but the seeker's position is never
    // sent to hiders (location sharing is one-way). Nothing the hider receives has coordinates.
    store.clearCooldown(seekerId);
    const hiderEvents: Array<[string, unknown]> = [];
    hider.sock.onAny((event: string, payload: unknown) => hiderEvents.push([event, payload]));
    const r3 = await seeker.emitWithAck("seeker:tag", { hiderPlayerId: hider.id, seeker: at(100) });
    expect(r3).not.toHaveProperty("exposed_until");
    seeker.emit("seeker:location", at(100));
    await sleep(100);
    expect(JSON.stringify(hiderEvents)).not.toContain(String(north(100).lat));
    expect(hiderEvents.map(([e]) => e)).not.toContain("seeker:exposed");
  });

  it("stale hider fix is refreshed before judging; successful tag ends the match for the last hider", async () => {
    const { seeker, hiders, store, room } = await activeRoom();
    const hider = hiders[0]!;
    // Old fix far away; the fresh fix (sent on FORCE_GPS_FLUSH) shows the hider right next to the seeker.
    heartbeat(hider.sock, at(80), Date.now() - 15_000);
    await sleep(50);
    const flush = autoFlush(hider.sock, () => at(3));

    const caught = next(seeker, "hider:caught");
    const ended = next(hider.sock, "room:status", (s) => s.status === "ENDED");
    const r = await seeker.emitWithAck("seeker:tag", { hiderPlayerId: hider.id, seeker: at(0) });
    expect(flush.count).toBe(1);
    expect(r).toEqual({ result: "TAGGED" });
    expect(await caught).toMatchObject({ playerId: hider.id, method: "PROXIMITY", hidersRemaining: 0 });
    expect((await ended).winner).toBe("SEEKERS");
    expect(store.rooms.get(room.id)!.winner).toBe("SEEKERS");
  });

  it("GPS allowance is capped: ±15 m fixes tag at 5.9 m raw", async () => {
    const { seeker, hiders } = await activeRoom(2);
    heartbeat(hiders[0]!.sock, at(0, 15));
    await sleep(50);
    const r = await seeker.emitWithAck("seeker:tag", { hiderPlayerId: hiders[0]!.id, seeker: at(5.9, 15) });
    expect(r.result).toBe("TAGGED");
  });

  it("GPS allowance is capped: ±15 m fixes miss at 6.5 m raw", async () => {
    const { seeker, hiders } = await activeRoom(2);
    autoFlush(hiders[0]!.sock, () => at(0, 15));
    heartbeat(hiders[0]!.sock, at(0, 15));
    await sleep(50);
    const r = await seeker.emitWithAck("seeker:tag", { hiderPlayerId: hiders[0]!.id, seeker: at(6.5, 15) });
    expect(r.result).toBe("OUT_OF_RANGE");
  });

  it("3 ft radius: exact fixes 2 m apart miss", async () => {
    const { seeker, hiders } = await activeRoom(2);
    autoFlush(hiders[0]!.sock, () => at(0, 0));
    heartbeat(hiders[0]!.sock, at(0, 0));
    await sleep(50);
    const r = await seeker.emitWithAck("seeker:tag", { hiderPlayerId: hiders[0]!.id, seeker: at(2, 0) });
    expect(r.result).toBe("OUT_OF_RANGE");
  });

  it("hider that ignores FORCE_GPS_FLUSH costs ~2 s max, then is judged on old data", async () => {
    const { seeker, hiders } = await activeRoom();
    heartbeat(hiders[0]!.sock, at(25)); // vs seeker at −5 m: 30 m raw − 5.09 m ≈ 25 m → borderline
    await sleep(50);
    const started = Date.now();
    const r = await seeker.emitWithAck("seeker:tag", { hiderPlayerId: hiders[0]!.id, seeker: at(-5) });
    expect(r.result).toBe("OUT_OF_RANGE");
    expect(Date.now() - started).toBeGreaterThanOrEqual(250); // waited for the (test-sized) flush timeout
  });

  it("only seekers can tag", async () => {
    const { hiders } = await activeRoom(2);
    const r = await hiders[0]!.sock.emitWithAck("seeker:tag", { hiderPlayerId: hiders[1]!.id, seeker: at(0) });
    expect(r).toEqual({ result: "INVALID" });
  });
});

describe("manual tag request + self-surrender", () => {
  it("is only offered after a failed tag; hider accepts → caught via TAG_REQUEST", async () => {
    const { seeker, hiders } = await activeRoom(2);
    const hider = hiders[0]!;
    heartbeat(hider.sock, at(0));
    await sleep(50);

    expect(await seeker.emitWithAck("seeker:tag_request", { hiderPlayerId: hider.id })).toEqual({
      ok: false,
      error: "NOT_ELIGIBLE",
    });

    autoFlush(hider.sock, () => at(0));
    const fail = await seeker.emitWithAck("seeker:tag", { hiderPlayerId: hider.id, seeker: at(60) });
    expect(fail.tagRequestEligible).toBe(true);

    const incoming = next(hider.sock, "tag_request:incoming");
    const req = await seeker.emitWithAck("seeker:tag_request", { hiderPlayerId: hider.id });
    expect(req.ok).toBe(true);
    const inc = await incoming;
    expect(inc.seekerName).toBe("Sam");

    const resolved = next(seeker, "tag_request:resolved");
    const caught = next(seeker, "hider:caught");
    hider.sock.emit("hider:tag_request_response", { requestId: inc.requestId, accept: true });
    expect((await resolved).resolution).toBe("ACCEPTED");
    expect(await caught).toMatchObject({ playerId: hider.id, method: "TAG_REQUEST", hidersRemaining: 1 });
  });

  it("unanswered request expires and blocks an immediate retry", async () => {
    const { seeker, hiders } = await activeRoom();
    const hider = hiders[0]!;
    // No telemetry at all → eligible (stale).
    const req = await seeker.emitWithAck("seeker:tag_request", { hiderPlayerId: hider.id });
    expect(req.ok).toBe(true);
    const resolved = await next(hider.sock, "tag_request:resolved");
    expect(resolved.resolution).toBe("EXPIRED");
    expect(await seeker.emitWithAck("seeker:tag_request", { hiderPlayerId: hider.id })).toEqual({
      ok: false,
      error: "COOLDOWN",
    });
  });

  it("self-surrender marks the hider caught", async () => {
    const { seeker, hiders } = await activeRoom(2);
    const caught = next(seeker, "hider:caught");
    expect(await hiders[1]!.sock.emitWithAck("hider:self_surrender")).toEqual({ ok: true });
    expect(await caught).toMatchObject({ playerId: hiders[1]!.id, method: "SELF_SURRENDER", byPlayerId: null });
  });
});

describe("out-of-bounds enforcement", () => {
  it("warns the hider immediately, exposes them to seekers after the grace period, clears on return", async () => {
    const { seeker, hiders, store } = await activeRoom();
    const hider = hiders[0]!;
    const warning = next(hider.sock, "hider:boundary_warning");
    const seekerOob = record(seeker, "hider:out_of_bounds");

    heartbeat(hider.sock, at(200)); // fence half-width ≈ 100 m (+ ~13 m buffer)
    expect((await warning).haptic).toEqual([200, 100, 200]);
    expect(store.players.get(hider.id)!.out_of_bounds_since).toBeTruthy();
    await sleep(50);
    expect(seekerOob).toHaveLength(0); // still in grace

    const penalty = await next(seeker, "hider:out_of_bounds");
    expect(penalty.playerId).toBe(hider.id);
    expect(penalty.location.lat).toBeCloseTo(north(200).lat, 6);

    const back = next(seeker, "hider:back_in_bounds");
    heartbeat(hider.sock, at(0));
    expect(await back).toEqual({ playerId: hider.id });
    await sleep(30);
    expect(store.players.get(hider.id)!.out_of_bounds_since).toBeNull();
  });

  it("a brief excursion inside the drift buffer is not a violation", async () => {
    const { hiders } = await activeRoom();
    const warnings = record(hiders[0]!.sock, "hider:boundary_warning");
    heartbeat(hiders[0]!.sock, at(105)); // past the raw edge, inside the 12 m buffer
    await sleep(100);
    expect(warnings).toHaveLength(0);
  });
});
