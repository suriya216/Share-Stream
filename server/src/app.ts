import express from "express";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import type { ClientToServer, ServerToClient } from "../../shared/types.js";
import { authRouter, recordHistory, verifyToken } from "./auth.js";
import { SessionStore } from "./sessions.js";
import { endSession, registerHandlers } from "./socket.js";

export interface AppOptions {
  /** Mount /api auth + history routes (requires a connected database) */
  accounts?: boolean;
}

export function createApp({ accounts = false }: AppOptions = {}) {
  const origin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
  const app = express();
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return void res.sendStatus(204);
    next();
  });
  app.get("/health", (_req, res) => res.json({ ok: true, accounts }));
  if (accounts) app.use("/api", authRouter());

  // Serve the built client (production) from the same origin
  const clientDist = fileURLToPath(new URL("../../../../client/dist", import.meta.url));
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/(api|socket\.io|health)).*/, (_req, res) =>
      res.sendFile(join(clientDist, "index.html")),
    );
  }

  const http = createServer(app);
  const io = new Server<ClientToServer, ServerToClient>(http, { cors: { origin } });
  if (accounts) {
    io.use((socket, next) => {
      socket.data.userId = verifyToken(socket.handshake.auth?.token);
      next();
    });
  }
  const store = new SessionStore();
  registerHandlers(io, store, undefined, accounts ? recordHistory : undefined);

  const sweeper = setInterval(
    () => store.sweep().forEach((s) => endSession(io, store, s, "Session expired")),
    60_000,
  );
  sweeper.unref();
  return { app, http, io, store };
}
