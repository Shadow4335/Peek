const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: "Couldn't sign you in. Check your connection and try again.",
  SUPABASE_NOT_CONFIGURED: "App isn't configured yet (missing Supabase env vars).",
  ROOM_NOT_FOUND: "No room with that code.",
  ROOM_NOT_JOINABLE: "That match has already started.",
  ROOM_FULL: "That room is full.",
  ROOM_NOT_IN_LOBBY: "The match has already started.",
  ROLE_FULL: "That side is full.",
  NOT_IN_ROOM: "You're not in this room.",
  NOT_HOST: "Only the host can do that.",
  ROLE_REQUIRED: "Pick Hider or Seeker first.",
  GPS_REQUIRED: "Waiting for your GPS location.",
  GPS_ACCURACY_TOO_LOW: "GPS too imprecise — step outside or wait a moment.",
  OUTSIDE_PLAY_ZONE: "You're outside the play zone.",
  ROSTER_NOT_READY: "Not everyone is ready.",
  NEED_READY_SEEKER_AND_HIDER: "Need at least one ready Seeker and one ready Hider.",
  INVALID_GEOFENCE: "The play zone shape is invalid.",
  ROOM_CODE_EXHAUSTED: "Couldn't allocate a room code. Try again.",
  NETWORK: "Network error. Check your connection.",
  ROOM_NOT_ENDED: "The match hasn't ended yet.",
  "Anonymous sign-ins are disabled": "Guest sign-in is turned off for this server.",
};

/** Maps SQL raise codes / socket error codes to friendly copy. */
export function friendlyError(err: unknown): string {
  const raw =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : typeof err === "object" && err && "message" in err
          ? String((err as { message: unknown }).message)
          : "";
  const code = raw.trim();
  if (MESSAGES[code]) return MESSAGES[code];
  if (/fetch|network/i.test(code)) return MESSAGES.NETWORK!;
  if (/check constraint/i.test(code)) return "Some match settings are out of range.";
  return "Something went wrong. Please try again.";
}
