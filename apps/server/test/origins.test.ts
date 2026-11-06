import { describe, expect, it } from "vitest";
import { createOriginMatcher } from "../src/origins";

describe("createOriginMatcher", () => {
  const ok = createOriginMatcher(["https://hideseek.app", "https://*.vercel.app", "http://localhost:3000/"]);

  it("matches exact origins (trailing slash tolerant)", () => {
    expect(ok("https://hideseek.app")).toBe(true);
    expect(ok("http://localhost:3000")).toBe(true);
    expect(ok("https://evil.app")).toBe(false);
  });

  it("matches one wildcard subdomain label only", () => {
    expect(ok("https://hide-seek-git-main-team.vercel.app")).toBe(true);
    expect(ok("https://vercel.app")).toBe(false);
    expect(ok("https://a.b.vercel.app")).toBe(false);
    expect(ok("https://x.vercel.app.evil.com")).toBe(false);
  });

  it("allows requests without an Origin header", () => {
    expect(ok(undefined)).toBe(true);
  });
});
