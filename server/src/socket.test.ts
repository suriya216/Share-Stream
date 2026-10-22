import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as connect, type Socket } from "socket.io-client";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";

let http: ReturnType<typeof createApp>["http"];
let url: string;
const clients: Socket[] = [];

const client = () => {
  const c = connect(url, { forceNew: true });
  clients.push(c);
  return c;
};
const emit = <T>(c: Socket, ev: string, payload?: unknown) =>
  new Promise<T>((res) => c.emit(ev, payload, res));
const once = <T>(c: Socket, ev: string) => new Promise<T>((res) => c.once(ev, res));

beforeAll(async () => {
  http = createApp().http;
  await new Promise<void>((r) => http.listen(0, r));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});
afterAll(() => {
  clients.forEach((c) => c.close());
  http.close();
});

const source = { type: "url", url: "https://example.com/v.mp4" };

describe("session lifecycle", () => {
  it("creates, joins (case-insensitive) and ends when host leaves", async () => {
    const host = client();
    const guest = client();
    const created: any = await emit(host, "session:create", { source });
    expect(created.ok).toBe(true);
    expect(created.session.code).toHaveLength(4);
    expect(created.session.isHost).toBe(true);

    const joined: any = await emit(guest, "session:join", { code: created.session.code.toLowerCase() });
    expect(joined.ok).toBe(true);
    expect(joined.session.isHost).toBe(false);
    expect(joined.session.viewers).toBe(2);

    const ended = once<string>(guest, "session:ended");
    host.emit("session:leave");
    expect(await ended).toBe("Host left the session");
    const again: any = await emit(client(), "session:join", { code: created.session.code });
    expect(again.ok).toBe(false);
  });

  it("broadcasts host playback to guests and ignores guest updates", async () => {
    const host = client();
    const guest = client();
    const other = client();
    const created: any = await emit(host, "session:create", { source });
    const code = created.session.code;
    await emit(guest, "session:join", { code });
    await emit(other, "session:join", { code });

    const got = once<any>(guest, "playback:state");
    host.emit("playback:update", { position: 42, playing: false });
    expect(await got).toMatchObject({ position: 42, playing: false });

    let leaked = false;
    host.once("playback:state", () => (leaked = true));
    guest.emit("playback:update", { position: 99, playing: true });
    await new Promise((r) => setTimeout(r, 100));
    expect(leaked).toBe(false);

    const late: any = await emit(client(), "session:join", { code });
    expect(late.session.playback.position).toBe(42);
  });

  it("rejects bad urls and unknown codes", async () => {
    const c = client();
    expect(((await emit(c, "session:create", { source: { type: "url", url: "javascript:1" } })) as any).ok).toBe(false);
    expect(((await emit(c, "session:join", { code: "ZZZZ" })) as any).error).toBe("Session not found");
  });

  it("detects youtube links", async () => {
    const c = client();
    const r: any = await emit(c, "session:create", { source: { type: "url", url: "https://youtu.be/abc" } });
    expect(r.session.source.type).toBe("youtube");
  });

  it("accepts a local file source by name", async () => {
    const r: any = await emit(client(), "session:create", { source: { type: "local", url: "movie.mp4" } });
    expect(r.session.source).toEqual({ type: "local", url: "movie.mp4" });
  });

  // Keep last: it exhausts this IP's failed-join budget
  it("rate limits repeated bad codes", async () => {
    const c = client();
    let last: any;
    for (let i = 0; i < 6; i++) last = await emit(c, "session:join", { code: "ZZZZ" });
    expect(last.error).toMatch(/Too many attempts/);
  });
});
