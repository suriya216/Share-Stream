import { describe, expect, it } from "vitest";
import { SessionStore, generateCode, normalizeCode, SESSION_TTL_MS } from "./sessions.js";

const src = { type: "url", url: "http://x/v.mp4" } as const;

describe("sessions", () => {
  it("generates 4-char codes without look-alikes", () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^[2-9A-HJKMNP-Z]{4}$/);
  });

  it("creates and finds a session case-insensitively", () => {
    const store = new SessionStore();
    const s = store.create("h1", src);
    expect(store.get(s.code.toLowerCase())?.hostId).toBe("h1");
    expect(normalizeCode(" ab12 ")).toBe("AB12");
  });

  it("expires sessions after the TTL", () => {
    const store = new SessionStore();
    const s = store.create("h1", src, 0);
    expect(store.get(s.code, SESSION_TTL_MS - 1)).toBeDefined();
    expect(store.get(s.code, SESSION_TTL_MS)).toBeUndefined();
  });

  it("sweep returns expired sessions", () => {
    const store = new SessionStore();
    store.create("a", src, 0);
    store.create("b", src, SESSION_TTL_MS);
    expect(store.sweep(SESSION_TTL_MS)).toHaveLength(1);
  });
});
