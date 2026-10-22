import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as connect } from "socket.io-client";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";
import { connectDb, disconnectDb } from "./db.js";

let mongo: MongoMemoryServer;
let http: ReturnType<typeof createApp>["http"];
let base: string;

const post = (path: string, body: unknown) =>
  fetch(`${base}/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: "7.0.14" } });
  await connectDb(mongo.getUri());
  http = createApp({ accounts: true }).http;
  await new Promise<void>((r) => http.listen(0, r));
  base = `http://localhost:${(http.address() as AddressInfo).port}`;
}, 500_000);

afterAll(async () => {
  http.close();
  await disconnectDb();
  await mongo.stop();
});

describe("accounts", () => {
  it("registers, rejects duplicates and weak input, logs in", async () => {
    expect((await post("/auth/register", { username: "Alice", password: "short" })).status).toBe(400);
    const reg = await post("/auth/register", { username: "Alice", password: "correct-horse" });
    expect(reg.status).toBe(201);
    expect((await post("/auth/register", { username: "alice", password: "correct-horse" })).status).toBe(409);

    const bad = await post("/auth/login", { username: "alice", password: "wrong-password" });
    expect(bad.status).toBe(401);
    const ok = await post("/auth/login", { username: "alice", password: "correct-horse" });
    expect((await ok.json()).username).toBe("alice");
  });

  it("requires a token for history and records sessions for signed-in users", async () => {
    expect((await fetch(`${base}/api/history`)).status).toBe(401);

    const { token } = await (await post("/auth/login", { username: "alice", password: "correct-horse" })).json();
    const sock = connect(base, { forceNew: true, auth: { token } });
    const ack: any = await new Promise((res) =>
      sock.emit("session:create", { source: { type: "url", url: "https://example.com/v.mp4" } }, res),
    );
    expect(ack.ok).toBe(true);
    sock.close();

    await new Promise((r) => setTimeout(r, 100));
    const rows = await (await fetch(`${base}/api/history`, { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: ack.session.code, role: "host", source: "https://example.com/v.mp4" });
  });
});
