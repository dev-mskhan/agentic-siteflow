import { Router, type IRouter } from "express";
import { db } from "../infrastructure/database/client.js";
import { redis } from "../infrastructure/redis/client.js";

const router: IRouter = Router();

/**
 * GET /ready
 * Readiness probe — indicates the server is ready to accept traffic.
 *
 * Phase 0.2: Database connectivity check added.
 * Phase 0.3: Redis connectivity check added.
 *
 * The response shape is stable; consumers should check `status === "ok"`.
 * Never throws — always returns a structured response.
 *
 * HTTP 200  → { status: "ok",       checks: { database: "ok", redis: "ok" } }
 * HTTP 503  → { status: "degraded", checks: { database: "...", redis: "..." } }
 */
router.get("/ready", async (_req, res) => {
  let databaseStatus: "ok" | "unavailable" = "unavailable";
  let redisStatus: "ok" | "unavailable" = "unavailable";

  // ── Database check ──────────────────────────────────────────────────────
  try {
    const queryPromise = db.$queryRaw`SELECT 1`;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DB ping timeout")), 3_000),
    );
    await Promise.race([queryPromise, timeoutPromise]);
    databaseStatus = "ok";
  } catch {
    // Intentionally swallowed — degraded state is returned below.
    databaseStatus = "unavailable";
  }

  // ── Redis check ─────────────────────────────────────────────────────────
  try {
    const pingPromise = redis.ping();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Redis ping timeout")), 3_000),
    );
    const result = await Promise.race([pingPromise, timeoutPromise]);
    redisStatus = result === "PONG" ? "ok" : "unavailable";
  } catch {
    // Intentionally swallowed — degraded state is returned below.
    redisStatus = "unavailable";
  }

  const allOk = databaseStatus === "ok" && redisStatus === "ok";

  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ok" : "degraded",
    checks: {
      database: databaseStatus,
      redis: redisStatus,
    },
  });
});

export { router as readyRouter };
