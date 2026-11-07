import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_MS = 12 * 60 * 60_000;

/**
 * Stateless admin sessions: `base64url(expiry).hmac`. The signing key is random per
 * process, so every server restart signs admins out (fine for a single instance).
 */
export class AdminSessions {
  private readonly key = randomBytes(32);

  issue(now = Date.now()) {
    const exp = now + ADMIN_SESSION_MS;
    const body = Buffer.from(String(exp)).toString("base64url");
    return { token: `${body}.${this.sign(body)}`, expiresAt: new Date(exp).toISOString() };
  }

  verify(token: string | undefined, now = Date.now()): boolean {
    if (!token) return false;
    const [body, sig] = token.split(".");
    if (!body || !sig) return false;
    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    const exp = Number(Buffer.from(body, "base64url").toString());
    return Number.isFinite(exp) && exp > now;
  }

  private sign(body: string) {
    return createHmac("sha256", this.key).update(body).digest("base64url");
  }
}

/** Fixed-window login limiter per client IP. */
export class LoginLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max = 8,
    private readonly windowMs = 15 * 60_000,
  ) {}

  /** Returns ms until retry is allowed, or 0 if this attempt may proceed. */
  take(ip: string, now = Date.now()): number {
    const h = this.hits.get(ip);
    if (!h || h.resetAt <= now) {
      this.hits.set(ip, { count: 1, resetAt: now + this.windowMs });
      return 0;
    }
    if (h.count >= this.max) return h.resetAt - now;
    h.count += 1;
    return 0;
  }

  reset(ip: string) {
    this.hits.delete(ip);
  }
}
