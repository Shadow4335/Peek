import { describe, expect, it } from "vitest";
import { NAME_MAX } from "./player";
import { randomName } from "./names";

describe("randomName", () => {
  it("produces two capitalised words within the name limit", () => {
    for (let i = 0; i < 200; i++) {
      const n = randomName();
      expect(n).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      expect(n.length).toBeLessThanOrEqual(NAME_MAX);
    }
  });

  it("is deterministic for a given random source", () => {
    expect(randomName(() => 0)).toBe("Sneaky Otter");
  });
});
