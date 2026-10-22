import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { Router, json, type Request, type RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { History, User } from "./db.js";
import { FailureLimiter } from "./ratelimit.js";
import type { Session } from "./sessions.js";

const SECRET = process.env.JWT_SECRET ?? randomBytes(32).toString("hex");
if (!process.env.JWT_SECRET) console.warn("JWT_SECRET not set: logins reset on every server restart");

const TOKEN_TTL = "7d";
const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export function verifyToken(token: unknown): string | undefined {
  if (typeof token !== "string") return undefined;
  try {
    const p = jwt.verify(token, SECRET);
    return typeof p === "object" ? p.sub : undefined;
  } catch {
    return undefined;
  }
}

const userId = (req: Request) => verifyToken(req.headers.authorization?.replace(/^Bearer /, ""));

const requireUser: RequestHandler = (req, res, next) => {
  const id = userId(req);
  if (!id) return void res.status(401).json({ error: "Sign in required" });
  res.locals.userId = id;
  next();
};

const wrap = (fn: RequestHandler): RequestHandler => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function authRouter(): Router {
  const router = Router();
  const loginFailures = new FailureLimiter(5, 60_000);
  router.use(json({ limit: "2kb" }));

  const issue = (id: string, username: string) => ({
    token: jwt.sign({}, SECRET, { subject: id, expiresIn: TOKEN_TTL }),
    username,
  });

  router.post("/auth/register", wrap(async (req, res) => {
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    if (!USERNAME_RE.test(username))
      return void res.status(400).json({ error: "Username: 3-30 letters, digits or _" });
    if (password.length < 8 || password.length > 72)
      return void res.status(400).json({ error: "Password must be 8-72 characters" });
    try {
      const user = await User.create({ username, passwordHash: await bcrypt.hash(password, 12) });
      res.status(201).json(issue(user.id, user.username));
    } catch (e: any) {
      if (e?.code === 11000) return void res.status(409).json({ error: "Username is taken" });
      throw e;
    }
  }));

  router.post("/auth/login", wrap(async (req, res) => {
    const ip = req.ip ?? "";
    if (loginFailures.blocked(ip)) return void res.status(429).json({ error: "Too many attempts, try again in a minute" });
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    const user = await User.findOne({ username });
    const ok = user && (await bcrypt.compare(String(req.body?.password ?? ""), user.passwordHash));
    if (!user || !ok) {
      loginFailures.fail(ip);
      return void res.status(401).json({ error: "Invalid username or password" });
    }
    res.json(issue(user.id, user.username));
  }));

  router.get("/history", requireUser, wrap(async (_req, res) => {
    const rows = await History.find({ userId: res.locals.userId }).sort({ at: -1 }).limit(20).lean();
    res.json(
      rows.map((r) => ({ code: r.code, role: r.role, sourceType: r.sourceType, source: r.source, at: r.at })),
    );
  }));

  return router;
}

export async function recordHistory(userId: string | undefined, s: Session, role: "host" | "guest") {
  if (!userId) return;
  try {
    await History.create({ userId, code: s.code, role, sourceType: s.source.type, source: s.source.url });
  } catch (e) {
    console.error("history write failed", e);
  }
}
