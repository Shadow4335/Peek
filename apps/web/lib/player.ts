import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@hideseek/shared";
import { randomName } from "./names";

const NAME_KEY = "hideseek:name";
const LAST_ROOM_KEY = "hideseek:lastRoom";
const ROLE_KEY = "hideseek:carryRole";
export const NAME_MAX = 24;
/** How long the landing page offers "Back to room …" after leaving it. */
const LAST_ROOM_TTL_MS = 6 * 60 * 60_000;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

/** Saved name, or a freshly generated one that is saved so it stays stable. */
export function loadName(): string {
  const saved = read(NAME_KEY)?.trim();
  if (saved) return saved;
  const generated = randomName();
  write(NAME_KEY, generated);
  return generated;
}

export function saveName(name: string) {
  if (name.trim()) write(NAME_KEY, name.trim());
}

export function cleanName(raw: string) {
  return raw.replace(/\s+/g, " ").slice(0, NAME_MAX);
}

/** Uppercases and strips anything outside the room-code alphabet. */
export function cleanCode(raw: string) {
  const allowed = new Set(ROOM_CODE_ALPHABET + "01IOL");
  return raw
    .toUpperCase()
    .split("")
    .filter((c) => allowed.has(c))
    .join("")
    .slice(0, ROOM_CODE_LENGTH);
}

// --- Last room (resume after closing the tab) ---------------------------------
export function rememberRoom(code: string) {
  write(LAST_ROOM_KEY, JSON.stringify({ code, at: Date.now() }));
}
export function forgetRoom() {
  write(LAST_ROOM_KEY, null);
}
export function lastRoomCode(): string | null {
  try {
    const v = JSON.parse(read(LAST_ROOM_KEY) ?? "null") as { code: string; at: number } | null;
    return v && Date.now() - v.at < LAST_ROOM_TTL_MS ? v.code : null;
  } catch {
    return null;
  }
}

// --- Role carry-over into a rematch -------------------------------------------
export function carryRoleInto(code: string, role: string) {
  try {
    sessionStorage.setItem(ROLE_KEY, JSON.stringify({ code, role }));
  } catch {
    /* ignore */
  }
}
/** Returns (and clears) the role to re-claim when entering `code`. */
export function takeCarriedRole(code: string): string | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(ROLE_KEY) ?? "null") as { code: string; role: string } | null;
    if (!v || v.code !== code) return null;
    sessionStorage.removeItem(ROLE_KEY);
    return v.role;
  } catch {
    return null;
  }
}
