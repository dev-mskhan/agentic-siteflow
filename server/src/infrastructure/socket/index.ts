import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Server as HttpServer } from "http";
import { jwtHelper } from "../jwt/jwt.js";
import { redis } from "../redis/client.js";
import { env } from "../../config/index.js";
import { logger } from "../logger.js";

/**
 * Socket.io server singleton.
 *
 * Attach to the HTTP server via `attachSocketServer(httpServer)` during bootstrap.
 * Use `emitToUser` / `emitToOrg` for server-initiated pushes from anywhere in the codebase.
 *
 * Connection authentication:
 *  - Client must pass JWT in socket.handshake.auth.token
 *  - On success the socket joins rooms `user:{userId}` and `org:{orgId}`
 *  - On failure the socket is disconnected immediately
 *
 * Multi-instance mode (REDIS_SOCKET_ADAPTER=true):
 *  - The Redis adapter is attached so broadcasts reach clients on any instance.
 *  - Two separate ioredis connections are used: the shared singleton for pub,
 *    and a dedicated duplicate client for sub (ioredis subscriber mode is
 *    exclusive — a subscribed client cannot issue regular commands).
 *  - emitToUser / emitToOrg work identically regardless of adapter mode.
 */
export const io = new Server({
  cors: {
    origin: env.CORS_ORIGINS.split(",").map((o) => o.trim()),
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Prefer websocket, fall back to polling
  transports: ["websocket", "polling"],
});

/**
 * Attach the Socket.io server to the given Node.js HTTP server.
 * Call this once during server bootstrap, after `http.createServer(app)`.
 */
export function attachSocketServer(httpServer: HttpServer): void {
  io.attach(httpServer);

  // ── Redis adapter (multi-instance mode) ─────────────────────────────────
  // When REDIS_SOCKET_ADAPTER=true, attach the Redis pub/sub adapter so that
  // broadcasts from one server instance are forwarded to all other instances.
  // The adapter requires two independent connections:
  //   • pubClient — the shared ioredis singleton (used for regular commands too)
  //   • subClient — a dedicated duplicate that enters subscriber mode
  // Using redis.duplicate() copies the connection options without sharing state.
  if (env.REDIS_SOCKET_ADAPTER) {
    const subClient = redis.duplicate();

    // Surface sub-client errors through the same logger so they don't go silent
    subClient.on("error", (err: unknown) => {
      logger.warn({ err }, "Socket.IO Redis adapter sub-client error");
    });

    io.adapter(createAdapter(redis, subClient));
    logger.info("Socket.IO Redis adapter enabled (multi-instance mode)");
  }

  // ── Connection handler ───────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      logger.warn({ socketId: socket.id }, "Socket connection rejected: missing auth token");
      socket.disconnect(true);
      return;
    }

    try {
      const payload = jwtHelper.verify(token);
      const userId = payload.sub;
      const orgId = payload.orgId;

      // Join per-user and per-org rooms for targeted emission
      void socket.join(`user:${userId}`);
      void socket.join(`org:${orgId}`);

      logger.info({ socketId: socket.id, userId, orgId }, "Socket client connected");

      socket.on("disconnect", (reason) => {
        logger.info({ socketId: socket.id, userId, reason }, "Socket client disconnected");
      });
    } catch {
      logger.warn({ socketId: socket.id }, "Socket connection rejected: invalid auth token");
      socket.disconnect(true);
    }
  });

  logger.info("Socket.io server attached to HTTP server");
}

/**
 * Emit an event to a specific user's socket room.
 * Safe to call even if the user is not currently connected (no-op in that case).
 * Works with both the in-memory adapter (single-instance) and the Redis adapter
 * (multi-instance) without any changes at the call site.
 */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  io.to(`user:${userId}`).emit(event, payload);
}

/**
 * Emit an event to all connected sockets in an organization.
 * Works with both the in-memory adapter (single-instance) and the Redis adapter
 * (multi-instance) without any changes at the call site.
 */
export function emitToOrg(orgId: string, event: string, payload: unknown): void {
  io.to(`org:${orgId}`).emit(event, payload);
}
