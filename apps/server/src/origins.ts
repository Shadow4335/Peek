/**
 * CORS / Socket.io origin check. Entries are exact origins ("https://hideseek.app") or
 * wildcard-subdomain patterns ("https://*.vercel.app") for Vercel preview deployments.
 */
export function createOriginMatcher(allowed: string[]) {
  const exact = new Set<string>();
  const patterns: RegExp[] = [];
  for (const entry of allowed) {
    if (entry === "*") {
      patterns.push(/^.*$/);
    } else if (entry.includes("*")) {
      const escaped = entry.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+");
      patterns.push(new RegExp(`^${escaped}$`, "i"));
    } else {
      exact.add(entry.replace(/\/$/, ""));
    }
  }
  return (origin: string | undefined): boolean => {
    // Non-browser clients (curl, health checks) send no Origin.
    if (!origin) return true;
    return exact.has(origin) || patterns.some((p) => p.test(origin));
  };
}

/** Adapter for the `cors` / socket.io `origin` option. */
export function corsOrigin(allowed: string[]) {
  const isAllowed = createOriginMatcher(allowed);
  return (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
    cb(null, isAllowed(origin));
}
