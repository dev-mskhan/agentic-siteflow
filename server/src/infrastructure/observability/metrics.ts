/**
 * Custom business metrics using the OpenTelemetry Metrics API.
 *
 * These counters/histograms are exported to SigNoz alongside auto-instrumented
 * spans. Import this module in any service that needs to record business events.
 *
 * Usage:
 *   import { metrics } from "../infrastructure/observability/metrics.js";
 *   metrics.httpRequestDuration.record(123, { route: "/trpc/project.get" });
 */
import { metrics as otelMetrics } from "@opentelemetry/api";

const meter = otelMetrics.getMeter("siteflow-server");

export const metrics = {
  // ── HTTP / API ──────────────────────────────────────────────────────────
  /** Total tRPC/REST procedure calls */
  apiCallsTotal: meter.createCounter("api.calls.total", {
    description: "Total number of API procedure invocations",
  }),

  /** HTTP request duration in milliseconds */
  httpRequestDuration: meter.createHistogram("http.request.duration_ms", {
    description: "HTTP request duration in milliseconds",
    unit: "ms",
  }),

  // ── Background jobs ─────────────────────────────────────────────────────
  /** Number of BullMQ jobs enqueued */
  jobsEnqueued: meter.createCounter("jobs.enqueued.total", {
    description: "Total background jobs enqueued",
  }),

  /** Number of BullMQ jobs completed */
  jobsCompleted: meter.createCounter("jobs.completed.total", {
    description: "Total background jobs completed successfully",
  }),

  /** Number of BullMQ jobs failed */
  jobsFailed: meter.createCounter("jobs.failed.total", {
    description: "Total background jobs that failed (all attempts exhausted)",
  }),

  /** BullMQ job processing duration in milliseconds */
  jobDuration: meter.createHistogram("jobs.duration_ms", {
    description: "Background job processing duration in milliseconds",
    unit: "ms",
  }),

  // ── Business domain ──────────────────────────────────────────────────────
  /** Auth events (login, register, refresh) */
  authEvents: meter.createCounter("auth.events.total", {
    description: "Authentication events by type",
  }),

  /** Number of active WebSocket connections (gauge approximation via updown counter) */
  socketConnections: meter.createUpDownCounter("socket.connections.active", {
    description: "Current number of active Socket.IO connections",
  }),

  /** Redis cache hit/miss */
  cacheOperations: meter.createCounter("cache.operations.total", {
    description: "Cache hit/miss by operation",
  }),
};
