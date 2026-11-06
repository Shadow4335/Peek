import type { CatchMethod, MatchWinner, PlayerRole, RoomStatus } from "./enums";

/** Minimal GeoJSON types to avoid a runtime dependency. */
export type Position = [number, number] | [number, number, number];
export interface PolygonGeometry {
  type: "Polygon";
  coordinates: Position[][];
}
export interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: Position[][][];
}
export type FenceGeometry = PolygonGeometry | MultiPolygonGeometry;

export interface RoomRules {
  max_players: number;
  seeker_count: number;
  game_duration_mins: number;
  head_start_secs: number;
  ping_interval_min_secs: number;
  ping_interval_max_secs: number;
}

export interface RoomRow extends RoomRules {
  id: string;
  code: string;
  host_user_id: string;
  status: RoomStatus;
  geofence: PolygonGeometry;
  geofence_buffered: FenceGeometry;
  geofence_area_m2: number;
  head_start_ends_at: string | null;
  started_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
  winner: MatchWinner | null;
  ping_wave_count: number;
  created_at: string;
  updated_at: string;
}

export interface PlayerRow {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  role: PlayerRole;
  is_host: boolean;
  is_ready: boolean;
  ready_checked_at: string | null;
  caught_at: string | null;
  caught_by_player_id: string | null;
  catch_method: CatchMethod | null;
  catches_count: number;
  last_failed_tag_at: string | null;
  exposed_until: string | null;
  out_of_bounds_since: string | null;
  last_seen_at: string;
  joined_at: string;
}

export interface HiderTelemetryRow {
  player_id: string;
  room_id: string;
  lat: number;
  lng: number;
  accuracy_m: number;
  battery: number | null;
  updated_at: string;
}

export interface PingSnapshotRow {
  id: string;
  room_id: string;
  wave_number: number;
  player_id: string;
  lat: number;
  lng: number;
  accuracy_m: number;
  stale: boolean;
  heartbeat_at: string;
  created_at: string;
}
