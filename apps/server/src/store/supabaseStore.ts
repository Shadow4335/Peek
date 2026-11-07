import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  HiderTelemetryRow,
  MatchWinner,
  PingSnapshotRow,
  PlayerRow,
  RoomRow,
  RoomStatus,
} from "@hideseek/shared";
import type { Env } from "../env";
import { createAdminClient, createUserClient } from "../supabase";
import type { CatchResult, GameStore, TagRpcArgs, TagRpcResult, UserScopedStore } from "./types";

/** Error whose message is the SQL raise code (e.g. "ROLE_FULL"). */
export class StoreError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "StoreError";
  }
}

function unwrap<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new StoreError(res.error.message, res.error.code);
  return res.data as T;
}

async function callRpc<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new StoreError(error.message, error.code);
  return data as T;
}

/** A plpgsql function returning a NULL composite comes back as an all-null object. */
function rowOrNull<T extends { id: string | null }>(row: T | null): T | null {
  return row && row.id ? row : null;
}

export class SupabaseGameStore implements GameStore {
  private readonly db: SupabaseClient;

  constructor(private readonly env: Env) {
    this.db = createAdminClient(env);
  }

  async getRoom(roomId: string) {
    return unwrap(await this.db.from("rooms").select("*").eq("id", roomId).maybeSingle<RoomRow>());
  }

  async listLiveRooms() {
    return (
      unwrap(
        await this.db.from("rooms").select("*").in("status", ["HEAD_START", "ACTIVE"]).returns<RoomRow[]>(),
      ) ?? []
    );
  }

  async listRecentRooms(limit: number) {
    return (
      unwrap(
        await this.db.from("rooms").select("*").order("created_at", { ascending: false }).limit(limit).returns<RoomRow[]>(),
      ) ?? []
    );
  }

  async getPlayersForRooms(roomIds: string[]) {
    if (roomIds.length === 0) return [];
    return (
      unwrap(await this.db.from("players").select("*").in("room_id", roomIds).returns<PlayerRow[]>()) ?? []
    );
  }

  async removePlayer(playerId: string) {
    unwrap(await this.db.from("players").delete().eq("id", playerId));
  }

  async getPlayers(roomId: string) {
    return (
      unwrap(await this.db.from("players").select("*").eq("room_id", roomId).returns<PlayerRow[]>()) ?? []
    );
  }

  async getPlayerByUser(roomId: string, userId: string) {
    return unwrap(
      await this.db
        .from("players")
        .select("*")
        .eq("room_id", roomId)
        .eq("user_id", userId)
        .maybeSingle<PlayerRow>(),
    );
  }

  async getTelemetry(roomId: string) {
    return (
      unwrap(
        await this.db
          .from("hider_telemetry")
          .select("*")
          .eq("room_id", roomId)
          .returns<HiderTelemetryRow[]>(),
      ) ?? []
    );
  }

  async upsertTelemetry(row: HiderTelemetryRow) {
    unwrap(await this.db.from("hider_telemetry").upsert(row, { onConflict: "player_id" }));
  }

  async setOutOfBounds(playerId: string, since: string | null) {
    unwrap(await this.db.from("players").update({ out_of_bounds_since: since }).eq("id", playerId));
  }

  async recordPingWave(roomId: string) {
    return (await callRpc<PingSnapshotRow[] | null>(this.db, "record_ping_wave", { p_room_id: roomId })) ?? [];
  }

  async transitionRoomStatus(
    roomId: string,
    from: RoomStatus,
    to: RoomStatus,
    winner: MatchWinner | null = null,
  ) {
    const row = await callRpc<RoomRow | null>(this.db, "transition_room_status", {
      p_room_id: roomId,
      p_from: from,
      p_to: to,
      p_winner: winner,
    });
    return rowOrNull(row);
  }

  async attemptProximityTag(a: TagRpcArgs) {
    return callRpc<TagRpcResult>(this.db, "attempt_proximity_tag", {
      p_room_id: a.roomId,
      p_seeker_player_id: a.seekerPlayerId,
      p_hider_player_id: a.hiderPlayerId,
      p_seeker_lat: a.seekerLat,
      p_seeker_lng: a.seekerLng,
      p_seeker_accuracy_m: a.seekerAccuracyM,
      p_fresh_fix_attempted: a.freshFixAttempted,
    });
  }

  async confirmManualTag(roomId: string, seekerPlayerId: string, hiderPlayerId: string) {
    return callRpc<CatchResult>(this.db, "confirm_manual_tag", {
      p_room_id: roomId,
      p_seeker_player_id: seekerPlayerId,
      p_hider_player_id: hiderPlayerId,
    });
  }

  asUser(accessToken: string): UserScopedStore {
    const db = createUserClient(this.env, accessToken);
    return {
      startMatch: (roomId, force) =>
        callRpc<RoomRow>(db, "start_match", { p_room_id: roomId, p_force: force }),
      selfSurrender: (roomId) => callRpc<CatchResult>(db, "self_surrender", { p_room_id: roomId }),
    };
  }

  async verifyAccessToken(accessToken: string) {
    const { data, error } = await this.db.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return data.user.id;
  }
}
