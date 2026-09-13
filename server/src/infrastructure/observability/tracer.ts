/**
 * OpenTelemetry SDK bootstrap for SigNoz.
 *
 * MUST be the very first import in the process entry-point (server.ts / workers.ts).
 * It registers auto-instrumentation for Express, HTTP, Redis (ioredis),
 * Prisma (db client), and BullMQ before any other module loads.
 *
 * Exports are sent to the SigNoz OTEL collector via OTLP/HTTP.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, ATTR_DEPLOYMENT_ENVIRONMENT_NAME } from "@opentelemetry/semantic-conventions";

// ── Env (read directly — cannot import ./config here as it hasn't loaded yet) ──
const OTEL_EXPORTER_OTLP_ENDPOINT =
  process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] ?? "http://localhost:4318";
const SERVICE_NAME = process.env["OTEL_SERVICE_NAME"] ?? "siteflow-server";
const SERVICE_VERSION = process.env["npm_package_version"] ?? "0.0.1";
const NODE_ENV = process.env["NODE_ENV"] ?? "development";

// Bail out early in test environments or when explicitly disabled
const isDisabled =
  process.env["OTEL_SDK_DISABLED"] === "true" || NODE_ENV === "test";


// ── Resource ──────────────────────────────────────────────────────────────────
const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: SERVICE_NAME,
  [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
  [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: NODE_ENV,
});

let sdk: NodeSDK | null = null;

if (!isDisabled) {
  // ── Trace exporter (OTLP/HTTP → SigNoz collector) ────────────────────────────
  const traceExporter = new OTLPTraceExporter({
    url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
  });

  // ── Metrics exporter (OTLP/HTTP → SigNoz collector) ──────────────────────────
  const metricExporter = new OTLPMetricExporter({
    url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 15_000, // export every 15 s
  });

  // ── SDK ───────────────────────────────────────────────────────────────────────
  sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Suppress very noisy internal FS spans (e.g. module resolution)
        "@opentelemetry/instrumentation-fs": { enabled: false },
        // HTTP spans — keep but filter out health probes
        "@opentelemetry/instrumentation-http": {
          ignoreIncomingRequestHook: (req) => {
            const url = req.url ?? "";
            return url === "/health" || url === "/ready";
          },
        },
      }),
    ],
  });

  sdk.start();

  // Graceful shutdown — flush spans/metrics before the process dies
  process.on("SIGTERM", () => {
    sdk?.shutdown().catch((err) => console.error("OTEL shutdown error", err));
  });
  process.on("SIGINT", () => {
    sdk?.shutdown().catch((err) => console.error("OTEL shutdown error", err));
  });
}

export { sdk };

