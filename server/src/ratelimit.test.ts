import { describe, expect, it } from "vitest";
import { FailureLimiter } from "./ratelimit.js";

describe("FailureLimiter", () => {
  it("blocks after max failures and recovers after the window", () => {
    const l = new FailureLimiter(3, 1000);
    for (let i = 0; i < 3; i++) {
      expect(l.blocked("ip", 0)).toBe(false);
      l.fail("ip", 0);
    }
    expect(l.blocked("ip", 999)).toBe(true);
    expect(l.blocked("other", 999)).toBe(false);
    expect(l.blocked("ip", 1000)).toBe(false);
  });
});
