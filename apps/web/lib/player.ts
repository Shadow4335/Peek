import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@hideseek/shared";

const NAME_KEY = "hideseek:name";
export const NAME_MAX = 24;

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    /* private mode */
  }
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
