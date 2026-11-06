import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@hideseek/shared";

export interface SocketData {
  userId: string;
  /** Latest Supabase access token (refreshed via "auth:refresh"). */
  token: string;
  roomId?: string;
  playerId?: string;
}

type InterServerEvents = Record<string, never>;

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/** Every member of a room (status, pings, catches). */
export const roomChannel = (roomId: string) => `room:${roomId}`;
/** All sockets of one player (private events). */
export const playerChannel = (playerId: string) => `player:${playerId}`;
/** A channel nobody joins — targeting it is a safe no-op (io.to([]) would broadcast to everyone). */
export const NOBODY = "__nobody__";
