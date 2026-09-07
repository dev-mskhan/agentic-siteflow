import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import { jwtHelper } from "../jwt/jwt.js";
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
 */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  io.to(`user:${userId}`).emit(event, payload);
}

/**
 * Emit an event to all connected sockets in an organization.
 */
export function emitToOrg(orgId: string, event: string, payload: unknown): void {
  io.to(`org:${orgId}`).emit(event, payload);
}
