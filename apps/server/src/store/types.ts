import type {
  CatchMethod,
  HiderTelemetryRow,
  MatchWinner,
  PingSnapshotRow,
  PlayerRow,
  RoomRow,
  RoomStatus,
} from "@hideseek/shared";

/** Result of _apply_catch (embedded in tag / surrender / manual-tag RPC results). */
export interface CatchResult {
  caught: boolean;
  match_ended?: boolean;
  winner?: MatchWinner | null;
  hiders_remaining?: number;
  reason?: string;
}

/** Raw jsonb from attempt_proximity_tag. Contains server-only fields — never forward as-is. */
export type TagRpcResult =
  | ({ result: "TAGGED" } & CatchResult)
  | {
      result: "OUT_OF_RANGE";
      cooldown_until: string;
      tag_request_eligible: boolean;
      exposure_triggered: boolean;
      exposed_until: string | null;
    }
  | { result: "COOLDOWN"; cooldown_until: string }
  | { result: "NEEDS_FRESH_FIX" }
  | { result: "INVALID"; reason: string };

export interface TagRpcArgs {
  roomId: string;
  seekerPlayerId: string;
  hiderPlayerId: string;
  seekerLat: number;
  seekerLng: number;
  seekerAccuracyM: number;
  freshFixAttempted: boolean;
}

/** RPCs executed with the end user's JWT so `auth.uid()` checks in SQL apply. */
export interface UserScopedStore {
  startMatch(roomId: string, force: boolean): Promise<RoomRow>;
  selfSurrender(roomId: string): Promise<CatchResult>;
}

/**
 * Data access for the authoritative server. The Supabase implementation uses the
 * service-role key; tests use an in-memory fake.
 */
export interface GameStore {
  getRoom(roomId: string): Promise<RoomRow | null>;
  listLiveRooms(): Promise<RoomRow[]>;
  getPlayers(roomId: string): Promise<PlayerRow[]>;
  getPlayerByUser(roomId: string, userId: string): Promise<PlayerRow | null>;
  getTelemetry(roomId: string): Promise<HiderTelemetryRow[]>;
  upsertTelemetry(row: HiderTelemetryRow): Promise<void>;
  setOutOfBounds(playerId: string, since: string | null): Promise<void>;
  recordPingWave(roomId: string): Promise<PingSnapshotRow[]>;
  transitionRoomStatus(
    roomId: string,
    from: RoomStatus,
    to: RoomStatus,
    winner?: MatchWinner | null,
  ): Promise<RoomRow | null>;
  attemptProximityTag(args: TagRpcArgs): Promise<TagRpcResult>;
  confirmManualTag(roomId: string, seekerPlayerId: string, hiderPlayerId: string): Promise<CatchResult>;
  asUser(accessToken: string): UserScopedStore;
  /** Returns the auth user id for a valid access token, else null. */
  verifyAccessToken(accessToken: string): Promise<string | null>;
}

export type { CatchMethod };
