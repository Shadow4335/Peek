import { Router, json, type NextFunction, type Request, type Response } from "express";
import type {
  AdminLoginResponse,
  AdminPosition,
  AdminRoomDetail,
  AdminRoomSummary,
  MatchWinner,
} from "@hideseek/shared";
import { z } from "zod";
import type { RoomManager } from "../game/RoomManager";
import { errorMessage, type Logger } from "../log";
import type { GameStore } from "../store/types";
import { roomChannel, type GameServer } from "../types";
import { AdminSessions, LoginLimiter } from "./auth";

interface AdminDeps {
  store: GameStore;
  manager: RoomManager;
  io: GameServer;
  log: Logger;
  checkPassword: (candidate: string) => boolean;
}

const LoginSchema = z.object({ password: z.string().min(1).max(200) });
const EndSchema = z.object({ winner: z.enum(["HIDERS", "SEEKERS"]).nullable() });
const Uuid = z.uuid();

/** Referee console API. Every route except /login needs `Authorization: Bearer <token>`. */
export function createAdminRouter({ store, manager, io, log, checkPassword }: AdminDeps) {
  const router = Router();
  const sessions = new AdminSessions();
  const limiter = new LoginLimiter();
  const alog = log.child({ area: "admin" });

  router.use(json({ limit: "4kb" }));
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.post("/login", (req, res) => {
    const ip = req.ip ?? "unknown";
    const wait = limiter.take(ip);
    if (wait > 0) {
      res.setHeader("Retry-After", String(Math.ceil(wait / 1000)));
      return res.status(429).json({ error: "TOO_MANY_ATTEMPTS" });
    }
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success || !checkPassword(parsed.data.password)) {
      alog.warn("admin login failed", { ip });
      return res.status(401).json({ error: "BAD_PASSWORD" });
    }
    limiter.reset(ip);
    alog.info("admin login", { ip });
    res.json(sessions.issue() satisfies AdminLoginResponse);
  });

  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const header = req.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!sessions.verify(token)) return void res.status(401).json({ error: "UNAUTHORIZED" });
    next();
  };
  router.use(requireAdmin);

  router.get("/session", (_req, res) => {
    res.json({ ok: true });
  });

  router.get("/rooms", async (req, res) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const rooms = await store.listRecentRooms(limit);
      const players = await store.getPlayersForRooms(rooms.map((r) => r.id));
      const summaries: AdminRoomSummary[] = rooms.map((r) => {
        const ps = players.filter((p) => p.room_id === r.id);
        const hiders = ps.filter((p) => p.role === "HIDER");
        return {
          id: r.id,
          code: r.code,
          status: r.status,
          createdAt: r.created_at,
          endsAt: r.ends_at,
          winner: r.winner,
          players: ps.length,
          hiders: hiders.length,
          hidersLeft: hiders.filter((p) => !p.caught_at).length,
          seekers: ps.filter((p) => p.role === "SEEKER").length,
          live: Boolean(manager.get(r.id)),
        };
      });
      res.json(summaries);
    } catch (err) {
      alog.error("list rooms failed", { err: errorMessage(err) });
      res.status(500).json({ error: "INTERNAL" });
    }
  });

  router.get("/rooms/:id", async (req, res) => {
    const id = Uuid.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: "BAD_REQUEST" });
    try {
      const room = await store.getRoom(id.data);
      if (!room) return res.status(404).json({ error: "ROOM_NOT_FOUND" });
      const players = await store.getPlayers(room.id);
      const rt = manager.get(room.id);
      const snap = rt?.adminSnapshot();

      let positions: AdminPosition[];
      if (snap) {
        positions = [
          ...snap.hiders.map((h) => ({ ...h, source: "telemetry" as const })),
          ...snap.seekers.map((s) => ({ ...s, battery: null, source: "beacon" as const })),
        ];
      } else {
        const tel = await store.getTelemetry(room.id);
        positions = tel.map((t) => ({
          playerId: t.player_id,
          lat: t.lat,
          lng: t.lng,
          accuracy_m: t.accuracy_m,
          battery: t.battery,
          at: t.updated_at,
          source: "telemetry",
        }));
      }

      const detail: AdminRoomDetail = {
        room,
        players,
        positions,
        nextPingAt: snap?.nextPingAt ?? null,
        exposedSeekers: snap?.exposedSeekers ?? [],
        outOfBoundsHiders: snap?.outOfBoundsHiders ?? players.filter((p) => p.out_of_bounds_since).map((p) => p.id),
      };
      res.json(detail);
    } catch (err) {
      alog.error("room detail failed", { err: errorMessage(err) });
      res.status(500).json({ error: "INTERNAL" });
    }
  });

  router.post("/rooms/:id/end", async (req, res) => {
    const id = Uuid.safeParse(req.params.id);
    const body = EndSchema.safeParse(req.body);
    if (!id.success || !body.success) return res.status(400).json({ error: "BAD_REQUEST" });
    try {
      const room = await store.getRoom(id.data);
      if (!room) return res.status(404).json({ error: "ROOM_NOT_FOUND" });
      if (room.status === "ENDED") return res.status(409).json({ error: "ALREADY_ENDED" });
      const winner: MatchWinner | null = body.data.winner;
      const row = await store.transitionRoomStatus(room.id, room.status, "ENDED", winner);
      if (!row) return res.status(409).json({ error: "STATE_CHANGED" });
      const rt = manager.get(room.id);
      if (rt) await rt.resync(row); // stops timers and broadcasts room:status
      else {
        io.to(roomChannel(row.id)).emit("room:status", {
          roomId: row.id,
          status: row.status,
          headStartEndsAt: row.head_start_ends_at,
          endsAt: row.ends_at,
          winner: row.winner,
        });
      }
      alog.info("admin ended room", { roomId: row.id, winner });
      res.json({ ok: true });
    } catch (err) {
      alog.error("end room failed", { err: errorMessage(err) });
      res.status(500).json({ error: "INTERNAL" });
    }
  });

  router.delete("/rooms/:id/players/:playerId", async (req, res) => {
    const id = Uuid.safeParse(req.params.id);
    const pid = Uuid.safeParse(req.params.playerId);
    if (!id.success || !pid.success) return res.status(400).json({ error: "BAD_REQUEST" });
    try {
      const room = await store.getRoom(id.data);
      if (!room) return res.status(404).json({ error: "ROOM_NOT_FOUND" });
      if (room.status !== "LOBBY") return res.status(409).json({ error: "ROOM_NOT_IN_LOBBY" });
      const player = (await store.getPlayers(room.id)).find((p) => p.id === pid.data);
      if (!player) return res.status(404).json({ error: "PLAYER_NOT_FOUND" });
      if (player.is_host) return res.status(409).json({ error: "CANNOT_KICK_HOST" });
      await store.removePlayer(player.id);
      alog.info("admin kicked player", { roomId: room.id, playerId: player.id });
      res.json({ ok: true });
    } catch (err) {
      alog.error("kick failed", { err: errorMessage(err) });
      res.status(500).json({ error: "INTERNAL" });
    }
  });

  return router;
}
