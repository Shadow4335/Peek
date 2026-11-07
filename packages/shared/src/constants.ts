/**
 * Game constants. Mirrored in supabase/migrations/0001_init_hide_and_seek.sql —
 * change both together.
 */
export const EARTH_RADIUS_M = 6_371_008.8;

export const ROOM_CODE_LENGTH = 6;
/** Unambiguous alphabet (no 0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// Geofence
export const GEOFENCE_DRIFT_BUFFER_KM = 0.012;
export const GEOFENCE_CIRCLE_STEPS = 64;
export const OUT_OF_BOUNDS_GRACE_MS = 15_000;

// Lobby
export const READY_MAX_ACCURACY_M = 30;
/** start_match ignores a Ready whose GPS check is older than this (0002 migration). */
export const READY_FRESH_MS = 120_000;
/** Clients re-verify their Ready GPS check this often while ready. */
export const READY_REFRESH_MS = 30_000;

// Telemetry
export const HEARTBEAT_INTERVAL_MS = 5_000;
export const PING_STALE_AFTER_MS = 20_000;

// Ping scheduler
export const ENDGAME_WINDOW_MS = 10 * 60_000;
export const ENDGAME_PING_MULTIPLIER = 0.75;
export const PRE_PING_WARNING_MS = 10_000;
export const HAPTIC_PATTERN = [200, 100, 200] as const;
export const PING_MIN_RENDER_RADIUS_M = 10;
/** A ping wave stays on the map this long after it arrives, then hides until the next wave. */
export const PING_VISIBLE_MS = 15_000;
/** Opacity for [latest, N-1, N-2]; older waves are hidden. */
export const PING_HISTORY_OPACITY = [1, 0.5, 0.2] as const;

// Tagging (Option C)
export const TAG_MAX_ACCURACY_DISCOUNT_M = 20;
/** 3 ft. Applied to d_effective (after the GPS accuracy discount). */
export const TAG_SUCCESS_THRESHOLD_M = 0.9144;
export const TAG_BORDERLINE_MAX_M = 40;
export const TAG_FRESH_FIX_MAX_AGE_MS = 10_000;
export const TAG_FRESH_FIX_TIMEOUT_MS = 2_000;
export const TAG_FAIL_COOLDOWN_MS = 20_000;
export const TAG_STRIKE_WINDOW_MS = 60_000;
export const TAG_STRIKES_FOR_PENALTY = 2;
export const SEEKER_EXPOSURE_MS = 30_000;
export const TAG_REQUEST_ELIGIBLE_STALE_MS = 30_000;
export const TAG_REQUEST_CONFIRM_MS = 15_000;

// Room rule bounds (must match CHECK constraints)
export const RULE_BOUNDS = {
  maxPlayers: { min: 2, max: 50 },
  seekerCount: { min: 1, max: 49 },
  gameDurationMins: { min: 5, max: 240 },
  headStartSecs: { min: 0, max: 1800 },
  pingIntervalSecs: { min: 30, max: 1800 },
} as const;
