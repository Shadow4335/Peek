"use client";

import type {
  FenceGeometry,
  GeoFix,
  PlayerRole,
  PlayerRow,
  PolygonGeometry,
  RoomRow,
  RoomRules,
} from "@hideseek/shared";
import { ensureSession, getSupabase } from "./supabase";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  await ensureSession();
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface CreateRoomInput extends RoomRules {
  displayName: string;
  geofence: PolygonGeometry;
  geofenceBuffered: FenceGeometry;
  areaM2: number;
}

export function createRoom(i: CreateRoomInput) {
  return rpc<RoomRow>("create_room", {
    p_display_name: i.displayName,
    p_max_players: i.max_players,
    p_seeker_count: i.seeker_count,
    p_game_duration_mins: i.game_duration_mins,
    p_head_start_secs: i.head_start_secs,
    p_ping_interval_min_secs: i.ping_interval_min_secs,
    p_ping_interval_max_secs: i.ping_interval_max_secs,
    p_geofence: i.geofence,
    p_geofence_buffered: i.geofenceBuffered,
    p_geofence_area_m2: i.areaM2,
  });
}

export function joinRoom(code: string, displayName: string) {
  return rpc<PlayerRow>("join_room", { p_code: code, p_display_name: displayName });
}

export function claimLobbyRole(roomId: string, role: PlayerRole) {
  return rpc<PlayerRow>("claim_lobby_role", { p_room_id: roomId, p_role: role });
}

export function setPlayerReady(roomId: string, ready: boolean, fix?: GeoFix | null) {
  return rpc<PlayerRow>("set_player_ready", {
    p_room_id: roomId,
    p_ready: ready,
    p_lat: fix?.lat ?? null,
    p_lng: fix?.lng ?? null,
    p_accuracy_m: fix?.accuracy_m ?? null,
  });
}

/** Direct RPC fallback when the game-server socket is down (the server sweep picks it up). */
export function startMatchRpc(roomId: string, force: boolean) {
  return rpc<RoomRow>("start_match", { p_room_id: roomId, p_force: force });
}

export function leaveRoom(roomId: string) {
  return rpc<null>("leave_room", { p_room_id: roomId });
}

export async function fetchRoom(roomId: string): Promise<RoomRow | null> {
  const { data, error } = await getSupabase().from("rooms").select("*").eq("id", roomId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as RoomRow | null;
}

export async function fetchPlayers(roomId: string): Promise<PlayerRow[]> {
  const { data, error } = await getSupabase()
    .from("players")
    .select("*")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PlayerRow[];
}

export function setDisplayName(roomId: string, name: string) {
  return rpc<PlayerRow>("set_display_name", { p_room_id: roomId, p_display_name: name });
}

/** Returns the rematch room code (creates it on first call). */
export function createRematch(roomId: string) {
  return rpc<string>("create_rematch", { p_room_id: roomId });
}
