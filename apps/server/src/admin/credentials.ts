import { scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hardcoded admin credential. Only an scrypt hash is stored, so the password never
 * appears in the repo, logs or the browser bundle.
 *
 * To change it, run (from the repo root):
 *   node -e 'const c=require("crypto");const p=process.argv[1];const s=c.randomBytes(16).toString("hex");console.log(s, c.scryptSync(p,s,32,{N:16384,r:8,p:1}).toString("hex"))' "NEW-PASSWORD"
 * and paste the two values below.
 */
const ADMIN_PASSWORD_SALT = "dd0a4a772f7f04e0e8bcefa0a3bea134";
const ADMIN_PASSWORD_HASH = "95ff85891885bae7bf537c2003a53bfe0543595f582f7d70604eed8c63288e8a";
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;

export function verifyAdminPassword(candidate: string): boolean {
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 200) return false;
  const expected = Buffer.from(ADMIN_PASSWORD_HASH, "hex");
  const actual = scryptSync(candidate, ADMIN_PASSWORD_SALT, expected.length, SCRYPT);
  return timingSafeEqual(actual, expected);
}
