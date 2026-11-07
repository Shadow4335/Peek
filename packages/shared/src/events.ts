import type { CatchMethod, MatchWinner, PlayerRole, RoomStatus, TagResult } from "./enums";
import type { GeoFix } from "./geo";

/** Socket ack envelope. Errors are short machine codes (e.g. "ROLE_FULL", "NOT_HOST"). */
export type AckResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
export type Ack<T> = (response: T) => void;

/** Hider → server private heartbeat (every HEARTBEAT_INTERVAL_MS). */
export interface HeartbeatPayload extends GeoFix {
  battery: number | null;
  /** ISO time of the GPS fix (position.timestamp). Clamped to server "now". */
  updated_at: string;
}

/** Hider's reply to FORCE_GPS_FLUSH. */
export interface FreshFixPayload extends HeartbeatPayload {
  requestId: string;
}

export interface TagAttemptPayload {
  hiderPlayerId: string;
  seeker: GeoFix;
}

/** Never carries distance telemetry (anti-fishing). */
export interface TagAttemptResponse {
  result: TagResult;
  /** ISO time the seeker's tag button unlocks (after a failure / during cooldown). */
  cooldownUntil?: string;
  /** Seeker may offer "Standing right next to them? Send Tag Request". */
  tagRequestEligible?: boolean;
}

export interface RoomStatusEvent {
  roomId: string;
  status: RoomStatus;
  headStartEndsAt: string | null;
  endsAt: string | null;
  winner: MatchWinner | null;
}

export interface PingWaveEvent {
  roomId: string;
  waveNumber: number;
  firedAt: string;
  pings: Array<GeoFix & { playerId: string; stale: boolean; heartbeatAt: string }>;
}

export interface OutOfBoundsEvent {
  playerId: string;
  since: string;
  /** Penalty: the hider's live fix is revealed to seekers while out of bounds. */
  location: GeoFix;
}

export interface HiderCaughtEvent {
  playerId: string;
  byPlayerId: string | null;
  method: CatchMethod;
  hidersRemaining: number;
}

export interface TagRequestIncomingEvent {
  requestId: string;
  seekerPlayerId: string;
  seekerName: string;
  expiresAt: string;
}

export type TagRequestResolution = "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";

export interface TagRequestResolvedEvent {
  requestId: string;
  hiderPlayerId: string;
  seekerPlayerId: string;
  resolution: TagRequestResolution;
}

/** Sent privately on (re)join so a reconnecting client can rebuild its view. */
export interface RoomStateEvent {
  status: RoomStatusEvent;
  you: { playerId: string; role: PlayerRole; caught: boolean };
  /** Seekers only. */
  outOfBoundsHiders: OutOfBoundsEvent[];
  /** Hider only: a tag request awaiting their answer. */
  pendingTagRequest: TagRequestIncomingEvent | null;
}

export type RoomJoinResponse = AckResult<{ playerId: string; role: PlayerRole; status: RoomStatus }>;
export type TagRequestResponse = AckResult<{ requestId: string; expiresAt: string }>;

export interface ClientToServerEvents {
  /** Push a refreshed Supabase access token (tokens expire hourly). */
  "auth:refresh": (p: { token: string }) => void;
  "room:join": (p: { roomId: string }, ack: Ack<RoomJoinResponse>) => void;
  "host:start_match": (p: { roomId: string; force: boolean }, ack: Ack<AckResult>) => void;
  "hider:heartbeat": (p: HeartbeatPayload) => void;
  "hider:fresh_fix": (p: FreshFixPayload) => void;
  "hider:self_surrender": (ack: Ack<AckResult>) => void;
  "hider:tag_request_response": (p: { requestId: string; accept: boolean }) => void;
  "seeker:location": (p: GeoFix) => void;
  "seeker:tag": (p: TagAttemptPayload, ack: Ack<TagAttemptResponse>) => void;
  "seeker:tag_request": (p: { hiderPlayerId: string }, ack: Ack<TagRequestResponse>) => void;
}

export interface ServerToClientEvents {
  "room:status": (p: RoomStatusEvent) => void;
  "room:state": (p: RoomStateEvent) => void;
  "ping:wave": (p: PingWaveEvent) => void;
  /** Hiders only, PRE_PING_WARNING_MS before a wave. Client vibrates `haptic`. */
  "ping:pre_warning": (p: { inMs: number; haptic: number[] }) => void;
  /** Private to one hider: send a fresh fix via "hider:fresh_fix" within timeoutMs. */
  FORCE_GPS_FLUSH: (p: { requestId: string; timeoutMs: number }) => void;
  /** Private to one hider: just left the buffered fence; penalty after graceMs. */
  "hider:boundary_warning": (p: { graceMs: number; haptic: number[] }) => void;
  "hider:out_of_bounds": (p: OutOfBoundsEvent) => void;
  "hider:back_in_bounds": (p: { playerId: string }) => void;
  "hider:caught": (p: HiderCaughtEvent) => void;
  "tag_request:incoming": (p: TagRequestIncomingEvent) => void;
  "tag_request:resolved": (p: TagRequestResolvedEvent) => void;
}
