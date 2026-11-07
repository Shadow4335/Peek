import type { PlayerRow, RoomRow } from "./db";
import type { MatchWinner, RoomStatus } from "./enums";
import type { GeoFix } from "./geo";

/** Admin console (referee) API — served by the game server under /admin. */
export interface AdminLoginResponse {
  token: string;
  expiresAt: string;
}

export interface AdminRoomSummary {
  id: string;
  code: string;
  status: RoomStatus;
  createdAt: string;
  endsAt: string | null;
  winner: MatchWinner | null;
  players: number;
  hiders: number;
  hidersLeft: number;
  seekers: number;
  /** A runtime is driving this room on the server right now. */
  live: boolean;
}

export interface AdminPosition extends GeoFix {
  playerId: string;
  battery: number | null;
  at: string;
  source: "telemetry" | "beacon";
}

export interface AdminRoomDetail {
  room: RoomRow;
  players: PlayerRow[];
  positions: AdminPosition[];
  /** Server-only knowledge; the admin may see it. */
  nextPingAt: string | null;
  exposedSeekers: Array<{ seekerPlayerId: string; until: string }>;
  outOfBoundsHiders: string[];
}

export interface AdminEndRequest {
  winner: MatchWinner | null;
}
