export const ROOM_STATUS = ["LOBBY", "HEAD_START", "ACTIVE", "ENDED"] as const;
export type RoomStatus = (typeof ROOM_STATUS)[number];

export const PLAYER_ROLE = ["UNASSIGNED", "HIDER", "SEEKER"] as const;
export type PlayerRole = (typeof PLAYER_ROLE)[number];

export const MATCH_WINNER = ["HIDERS", "SEEKERS"] as const;
export type MatchWinner = (typeof MATCH_WINNER)[number];

export const CATCH_METHOD = ["PROXIMITY", "SELF_SURRENDER", "TAG_REQUEST"] as const;
export type CatchMethod = (typeof CATCH_METHOD)[number];

/** Result codes from attempt_proximity_tag. Never carries distance data. */
export const TAG_RESULT = [
  "TAGGED",
  "OUT_OF_RANGE",
  "COOLDOWN",
  "NEEDS_FRESH_FIX",
  "INVALID",
] as const;
export type TagResult = (typeof TAG_RESULT)[number];
