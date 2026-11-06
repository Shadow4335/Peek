import type { AckResult, RoomJoinResponse, TagAttemptResponse, TagRequestResponse } from "@hideseek/shared";
import type { RoomManager } from "./game/RoomManager";
import { errorMessage, type Logger } from "./log";
import type { GameStore } from "./store/types";
import { playerChannel, roomChannel, type GameServer, type GameSocket } from "./types";
import {
  FreshFixSchema,
  GeoFixSchema,
  HeartbeatSchema,
  RoomJoinSchema,
  StartMatchSchema,
  TagRequestResponseSchema,
  TagRequestSchema,
  TagSchema,
  TokenSchema,
} from "./validation";

interface SocketDeps {
  store: GameStore;
  manager: RoomManager;
  log: Logger;
}

/** Only pass SQL raise codes (e.g. ROLE_FULL) through to clients; hide everything else. */
function clientError(err: unknown): string {
  const msg = errorMessage(err);
  return /^[A-Z][A-Z_]{2,40}$/.test(msg) ? msg : "INTERNAL";
}

function reply<T>(ack: unknown, value: T) {
  if (typeof ack === "function") (ack as (v: T) => void)(value);
}

export function registerSocketHandlers(io: GameServer, { store, manager, log }: SocketDeps) {
  // Handshake auth: client passes its Supabase access token as `auth.token`.
  io.use(async (socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== "string" || token.length < 10) return next(new Error("UNAUTHORIZED"));
    try {
      const userId = await store.verifyAccessToken(token);
      if (!userId) return next(new Error("UNAUTHORIZED"));
      socket.data.userId = userId;
      socket.data.token = token;
      next();
    } catch (err) {
      log.warn("socket auth failed", { err: errorMessage(err) });
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket: GameSocket) => {
    const slog = log.child({ socket: socket.id, userId: socket.data.userId });

    /** Runtime + identity for the room this socket joined, if the room is live. */
    const live = () => {
      const { roomId, playerId } = socket.data;
      if (!roomId || !playerId) return null;
      const rt = manager.get(roomId);
      return rt ? { rt, roomId, playerId, role: rt.roleOf(playerId) } : null;
    };

    socket.on("auth:refresh", async (raw) => {
      const p = TokenSchema.safeParse(raw);
      if (!p.success) return;
      const userId = await store.verifyAccessToken(p.data.token).catch(() => null);
      if (userId === socket.data.userId) socket.data.token = p.data.token;
    });

    socket.on("room:join", async (raw, ack) => {
      const p = RoomJoinSchema.safeParse(raw);
      if (!p.success) return reply<RoomJoinResponse>(ack, { ok: false, error: "BAD_REQUEST" });
      try {
        const { roomId } = p.data;
        const player = await store.getPlayerByUser(roomId, socket.data.userId);
        if (!player) return reply<RoomJoinResponse>(ack, { ok: false, error: "NOT_IN_ROOM" });
        const room = await store.getRoom(roomId);
        if (!room) return reply<RoomJoinResponse>(ack, { ok: false, error: "ROOM_NOT_FOUND" });

        if (socket.data.roomId && socket.data.roomId !== roomId) {
          await socket.leave(roomChannel(socket.data.roomId));
          if (socket.data.playerId) await socket.leave(playerChannel(socket.data.playerId));
        }
        socket.data.roomId = roomId;
        socket.data.playerId = player.id;
        await socket.join([roomChannel(roomId), playerChannel(player.id)]);

        const rt = await manager.ensure(room);
        reply<RoomJoinResponse>(ack, {
          ok: true,
          playerId: player.id,
          role: rt?.roleOf(player.id) ?? player.role,
          status: rt?.status ?? room.status,
        });
        if (rt) socket.emit("room:state", rt.snapshotFor(player.id));
      } catch (err) {
        slog.error("room:join failed", { err: errorMessage(err) });
        reply<RoomJoinResponse>(ack, { ok: false, error: clientError(err) });
      }
    });

    socket.on("host:start_match", async (raw, ack) => {
      const p = StartMatchSchema.safeParse(raw);
      if (!p.success) return reply<AckResult>(ack, { ok: false, error: "BAD_REQUEST" });
      try {
        // Runs as the user: start_match checks host_user_id = auth.uid().
        const room = await store.asUser(socket.data.token).startMatch(p.data.roomId, p.data.force);
        const rt = await manager.ensure(room);
        if (!rt) io.to(roomChannel(room.id)).emit("room:status", {
          roomId: room.id,
          status: room.status,
          headStartEndsAt: room.head_start_ends_at,
          endsAt: room.ends_at,
          winner: room.winner,
        });
        slog.info("match started", { roomId: room.id, force: p.data.force });
        reply<AckResult>(ack, { ok: true });
      } catch (err) {
        reply<AckResult>(ack, { ok: false, error: clientError(err) });
      }
    });

    socket.on("hider:heartbeat", (raw) => {
      const ctx = live();
      const p = HeartbeatSchema.safeParse(raw);
      if (!ctx || !p.success || ctx.role !== "HIDER") return;
      void ctx.rt.ingestHeartbeat(ctx.playerId, p.data, { fresh: false });
    });

    socket.on("hider:fresh_fix", (raw) => {
      const ctx = live();
      const p = FreshFixSchema.safeParse(raw);
      if (!ctx || !p.success || ctx.role !== "HIDER") return;
      void ctx.rt.onFreshFix(ctx.playerId, p.data);
    });

    socket.on("hider:self_surrender", async (ack) => {
      const ctx = live();
      if (!ctx || ctx.role !== "HIDER") return reply<AckResult>(ack, { ok: false, error: "NOT_AN_ACTIVE_HIDER" });
      try {
        const result = await store.asUser(socket.data.token).selfSurrender(ctx.roomId);
        await ctx.rt.onCatch(ctx.playerId, null, "SELF_SURRENDER", result);
        reply<AckResult>(ack, { ok: true });
      } catch (err) {
        reply<AckResult>(ack, { ok: false, error: clientError(err) });
      }
    });

    socket.on("hider:tag_request_response", (raw) => {
      const ctx = live();
      const p = TagRequestResponseSchema.safeParse(raw);
      if (!ctx || !p.success || ctx.role !== "HIDER") return;
      void ctx.rt.respondTagRequest(ctx.playerId, p.data.requestId, p.data.accept);
    });

    socket.on("seeker:location", (raw) => {
      const ctx = live();
      const p = GeoFixSchema.safeParse(raw);
      if (!ctx || !p.success || ctx.role !== "SEEKER") return;
      ctx.rt.onSeekerLocation(ctx.playerId, p.data);
    });

    socket.on("seeker:tag", async (raw, ack) => {
      const ctx = live();
      const p = TagSchema.safeParse(raw);
      if (!ctx || !p.success || ctx.role !== "SEEKER") {
        return reply<TagAttemptResponse>(ack, { result: "INVALID" });
      }
      reply<TagAttemptResponse>(ack, await ctx.rt.handleTag(ctx.playerId, p.data));
    });

    socket.on("seeker:tag_request", (raw, ack) => {
      const ctx = live();
      const p = TagRequestSchema.safeParse(raw);
      if (!ctx || !p.success || ctx.role !== "SEEKER") {
        return reply<TagRequestResponse>(ack, { ok: false, error: "INVALID" });
      }
      reply<TagRequestResponse>(ack, ctx.rt.requestTag(ctx.playerId, p.data.hiderPlayerId));
    });
  });
}
