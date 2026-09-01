import http from "http";
import { env } from "./config/index.js";
import { logger } from "./infrastructure/logger.js";
import { createApp } from "./app/index.js";
import { disconnectDb } from "./infrastructure/database/client.js";
import { disconnectRedis } from "./infrastructure/redis/client.js";

/**
 * Server bootstrap.
 * This file ONLY starts the HTTP server and handles graceful shutdown.
 * No business logic lives here.
 */
const app = createApp();
const server = http.createServer(app);

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "Server started");
});

// ── Graceful shutdown ──────────────────────────────────────────────────────

let isShuttingDown = false;

function shutdown(signal: string): void {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, "Shutdown signal received, closing server gracefully");

  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error during server close");
      process.exit(1);
    }

    void disconnectDb()
      .catch((disconnectErr: unknown) => {
        logger.warn({ err: disconnectErr }, "Error disconnecting database");
      })
      .then(() => disconnectRedis())
      .catch((disconnectErr: unknown) => {
        logger.warn({ err: disconnectErr }, "Error disconnecting Redis");
      })
      .then(() => {
        logger.info("Server closed successfully");
        process.exit(0);
      });
  });

  // Force-kill after 10 seconds if connections linger
  setTimeout(() => {
    logger.warn("Graceful shutdown timeout exceeded, forcing exit");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "Unhandled promise rejection");
  process.exit(1);
});

export { server };
