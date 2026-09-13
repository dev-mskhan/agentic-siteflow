# SiteFlow Observability — SigNoz + OpenTelemetry

## Architecture

```
Node.js App (Express + BullMQ)
        │
        │  OTLP/HTTP :4318
        ▼
 OTEL Collector (signoz/signoz-otel-collector)
        │
        │  ClickHouse native :9000
        ▼
 ClickHouse DB  ←──── Zookeeper (coordination)
        ▲
        │
 SigNoz UI :3301
```

## Quick Start

### 1. Start app infrastructure (Postgres, Redis, MinIO)
```bash
docker compose up -d
```

### 2. Start full observability stack (SigNoz + OTEL Collector + ClickHouse)
```bash
docker compose --profile observability up -d
```

### 3. Open SigNoz UI
Visit: **http://localhost:3301**

---

## What's Instrumented

| Layer | Instrumentation | How |
|-------|----------------|-----|
| HTTP/Express | Auto (spans per request) | `@opentelemetry/auto-instrumentations-node` |
| tRPC routes | Auto (via HTTP spans) | Same as above |
| Postgres (Prisma) | Auto (DB spans) | `@opentelemetry/instrumentation-pg` |
| Redis (ioredis) | Auto (Redis spans) | `@opentelemetry/instrumentation-ioredis` |
| BullMQ workers | Auto (via Redis spans) | Same as above |
| Errors (AppError) | Manual span recording | `errorHandler.ts` |
| API call counters | Manual metrics | `observability/metrics.ts` |
| Job metrics | Manual metrics | `observability/metrics.ts` |

## Ports Reference

| Service | Port | Purpose |
|---------|------|---------|
| App server | 3000 | Express/tRPC API |
| OTEL Collector (HTTP) | 4318 | App sends OTLP here |
| OTEL Collector (gRPC) | 4317 | Alternative gRPC input |
| SigNoz UI | 3301 | Traces / metrics / logs dashboard |
| ClickHouse HTTP | 8123 | ClickHouse admin |

## Environment Variables

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318  # Collector address
OTEL_SERVICE_NAME=siteflow-server                   # Shown in SigNoz
OTEL_SDK_DISABLED=false                             # Set true in tests
```

## Disabling in Tests

Tests automatically disable OTEL (`NODE_ENV=test` bypasses SDK start).
No changes needed in test config.

## Adding Custom Spans

```typescript
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("siteflow-server");

export async function myService() {
  const span = tracer.startSpan("my-operation");
  try {
    // your logic
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw err;
  } finally {
    span.end();
  }
}
```

## Adding Custom Metrics

```typescript
import { metrics } from "../infrastructure/observability/metrics.js";

// Increment a counter
metrics.authEvents.add(1, { type: "login", result: "success" });

// Record a histogram value
metrics.jobDuration.record(durationMs, { queue: "documents" });
```
