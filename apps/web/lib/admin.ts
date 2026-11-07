"use client";

import type { AdminLoginResponse, AdminRoomDetail, AdminRoomSummary, MatchWinner } from "@hideseek/shared";
import { publicEnv } from "./env";

const KEY = "hideseek:admin";
const listeners = new Set<() => void>();

/** Token lives in sessionStorage: closing the tab signs the admin out. */
export const adminToken = {
  get(): string | null {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return null;
      const { token, expiresAt } = JSON.parse(raw) as AdminLoginResponse;
      return Date.parse(expiresAt) > Date.now() ? token : null;
    } catch {
      return null;
    }
  },
  set(v: AdminLoginResponse | null) {
    try {
      if (v) sessionStorage.setItem(KEY, JSON.stringify(v));
      else sessionStorage.removeItem(KEY);
    } catch {
      /* private mode */
    }
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export class AdminError extends Error {
  constructor(
    readonly status: number,
    code: string,
  ) {
    super(code);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = adminToken.get();
  let res: Response;
  try {
    res = await fetch(`${publicEnv.gameServerUrl}/admin${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new AdminError(0, "NETWORK");
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401 && path !== "/login") adminToken.set(null);
  if (!res.ok) throw new AdminError(res.status, body.error ?? "INTERNAL");
  return body as T;
}

export const adminApi = {
  login: async (password: string) => {
    const r = await call<AdminLoginResponse>("/login", { method: "POST", body: JSON.stringify({ password }) });
    adminToken.set(r);
  },
  rooms: () => call<AdminRoomSummary[]>("/rooms?limit=100"),
  room: (id: string) => call<AdminRoomDetail>(`/rooms/${id}`),
  end: (id: string, winner: MatchWinner | null) =>
    call<{ ok: true }>(`/rooms/${id}/end`, { method: "POST", body: JSON.stringify({ winner }) }),
  kick: (roomId: string, playerId: string) =>
    call<{ ok: true }>(`/rooms/${roomId}/players/${playerId}`, { method: "DELETE" }),
};

export function adminErrorText(err: unknown): string {
  const code = err instanceof Error ? err.message : String(err);
  return (
    {
      BAD_PASSWORD: "Wrong password.",
      TOO_MANY_ATTEMPTS: "Too many attempts — wait a few minutes.",
      NETWORK: "Can't reach the game server.",
      ALREADY_ENDED: "That match already ended.",
      STATE_CHANGED: "The room changed state — refresh and try again.",
      ROOM_NOT_IN_LOBBY: "Players can only be removed in the lobby.",
      CANNOT_KICK_HOST: "The host can't be removed.",
      UNAUTHORIZED: "Session expired — sign in again.",
    } as Record<string, string>
  )[code] ?? "Something went wrong.";
}
