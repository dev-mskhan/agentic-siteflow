import { Router, type IRouter } from "express";

const router: IRouter = Router();

/**
 * GET /health
 * Lightweight liveness probe — confirms the process is alive.
 * No dependency checks. Fast and always available.
 */
router.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

export { router as healthRouter };
