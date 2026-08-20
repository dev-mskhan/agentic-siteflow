# SiteFlow AI

**Construction operations platform** — built as a **modular monolith**: one deployable backend, clean module boundaries, production-grade local tooling from day one.

## Stack

| Layer | Technology |
| --- | --- |
| Language | TypeScript (strict) on Node 22 |
| Backend | Fastify 5 + tRPC 11 (no Express/REST) |
| API transport | tRPC over HTTP under `/api/v1/*` (query = GET) |
| Database | PostgreSQL 16 (+ pgvector for embeddings) |
| Cache / sessions / pub/sub | Redis 7 |
| Object storage | S3-compatible — MinIO locally, AWS S3 in production |
| Frontend | React 19 + Tailwind CSS v4 (Vite 6) + React Router 7 + TanStack Query |
| State | Redux Toolkit (client) / module-owned stores (server) |
| Realtime | Socket.IO (Redis adapter) |
| Infra | Docker Compose (local) + GitHub Actions (CI/CD) |

## Architecture

```
Browser ──▶ nginx (client container, :8080)
              │  SPA + Tailwind v4 build
              ├── /api/*   ──▶ server (:4000)  Fastify + tRPC
              ├── /health  ──▶ server
              ├── /ready   ──▶ server
              └── /socket.io/* ──▶ server
                                   │
                 ┌─────────────────┼─────────────────────┐
            ┌────▼────┐      ┌─────▼─────┐         ┌─────▼─────┐
            │ PostgreSQL │      │   Redis    │         │   MinIO   │
            │  + pgvector │      │  7-alpine  │         │  S3 API   │
            └──────────┘      └───────────┘         └───────────┘
```

The server is a **modular monolith**: `src/modules/*` each own their domain (routes, services, data access, AI integrations) and may only import from `src/common`, `src/config`, `src/trpc`, or the module's own directory. Cross-module imports are rejected by ESLint and by a Vitest architectural test. Modules register their tRPC routers into a single `appRouter`.

### Module map

`auth`, `organizations`, `projects`, `tasks`, `subcontractors`, `procurement`, `documents`, `payments`, `notifications`, `dashboard`, `ai` (graphs / agents / tools / prompts / evals stubs).

## Prerequisites

- Docker Desktop (or equivalent) with Compose v2
- Node.js **22.13.1** (use `nvm install 22.13.1 && nvm use`; `.nvmrc` is pinned)
- npm (single package manager; `server/package-lock.json` + `client/package-lock.json`)

## First run

```bash
cp .env.example .env
npm install
npm ci --prefix server
npm ci --prefix client

# Full stack (infra + server + client containers)
npm run docker:up
open http://localhost:8080
```

> The base `docker-compose.yml` builds and runs the **production-mode** images. It therefore requires non-placeholder JWT secrets — the server refuses to boot with `dev_*` / `change-me` secrets in production mode. For a one-off prod-like stack run `docker compose build` first, then `docker compose up -d` (see "Infrastructure" below for the ready image path).

Health checks:

- `http://localhost:4000/health` → `200 {"status":"ok",...}`
- `http://localhost:4000/ready` → `200 {"status":"ready","checks":[...]}` against Postgres + Redis + S3
- `GET http://localhost:4000/api/v1/app.status` → tRPC query listing all registered modules

## Development

```bash
# One-off tooling for infra (Postgres, Redis, MinIO) on Docker
npm run docker:up          # start infra containers (postgres, redis, minio, minio-init)

# Then run the apps on the host with hot reload
npm run dev                # starts server (:4000) and client Vite dev server (:5173)
```

Or use the fully-containerized dev overlay (live-reload inside containers):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

- Vite dev server: http://localhost:5173 (proxies `/api`, `/health`, `/ready`, `/socket.io` to `:4000`)
- API: http://localhost:4000

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run server + client with watch mode |
| `npm run lint` | ESLint (both apps) |
| `npm run typecheck` | `tsc --noEmit` (both apps) |
| `npm run test` | Vitest unit tests (both apps) — server includes integration tests |
| `npm run test:watch` | Watch mode for server tests |
| `npm run build` | Production builds for both apps |
| `npm run format` | Prettier (write) |
| `npm run format:check` | Prettier (check only) |
| `npm run docker:up` / `docker:down` / `logs` / `ps` | Compose shortcuts |

Integration tests (`server/tests/integration/`) require live infra and opt in via `RUN_INTEGRATION=1`; the CI workflow starts Compose infra before running them. Locally:

```powershell
$env:S3_ENDPOINT='http://127.0.0.1:9002'
npm --prefix server run test:integration
```

### Environment

`.env.example` is the canonical template; copy it to `.env` and adjust. Variables are read from the repo root by both apps (`client/vite.config.ts` sets `envDir: '..'`). Secrets live only in `.env` / your secrets manager — **never commit real secrets**. Infrastructure endpoints can be remapped with `POSTGRES_PORT`, `REDIS_PORT`, `MINIO_API_PORT`, `MINIO_CONSOLE_PORT`, `CLIENT_PORT`, `PORT` for machines where defaults are taken.

## Infrastructure (Docker Compose)

```bash
docker compose up -d
docker compose ps
docker compose logs -f
```

| Service | Container | Internal | Host (default) | Notes |
| --- | --- | --- | --- | --- |
| PostgreSQL 16 + pgvector | `siteflow-postgres` | `5432` | `5432` | `infra/docker/postgres/init.sql` enables `vector` |
| Redis 7 | `siteflow-redis` | `6379` | `6379` | password-auth enabled, AOF on |
| MinIO | `siteflow-minio` | `9000` | `9000` | S3 API; console `http://localhost:9001` |
| MinIO init | `siteflow-minio-init` | — | — | one-shot: creates the `siteflow` bucket |
| Server | `siteflow-server` | `4000` | `4000` | compiled production image |
| Client | `siteflow-client` | `8080` | `8080` | nginx (unprivileged) serving SPA |

Every service has a healthcheck; `server` waits for `postgres`, `redis`, `minio` healthy and `minio-init` to complete before starting; `client` waits for `server` healthy.

## Production builds

`.github/workflows/docker.yml` builds the production server and client images on `main`, scans them with Trivy, and pushes to the registry (configure the image tags there). The Dockerfiles are multi-stage:

- `server`: `node:22.13.1-alpine` base → `npm ci` → compile → `npm prune --omit=dev` → slim runtime as non-root `app` user.
- `client`: `node:22.13.1-alpine` → `npm ci` → `vite build` → `nginxinc/nginx-unprivileged:1.27-alpine` with SPA fallback + API/health/socket proxies.

Production-style run without CI (validates the exact images):

```bash
docker build -t siteflow/server:local -f server/Dockerfile --target production server
docker build -t siteflow/client:local -f client/Dockerfile --target production client
docker compose up -d --no-build server client
```

## Quality gates

`.github/workflows/ci.yml` runs on every push/PR: **lint → typecheck → test → build** for both apps, including the integration suite against live Compose infra. The merge gate is: all four stages pass.

### Conventions

- No `console.log` — structured logging via Pino (`service: siteflow-server`, env-tagged).
- Strict TypeScript; `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` etc. enabled.
- Prettier formatting enforced in CI.
- Modules must be self-contained; new modules register in `src/modules/index.ts` and export a tRPC router.

## Roadmap snapshot (Phase 0 done)

- Package layout, tooling, quality gates, CI/CD — **done**
- Local infra (Postgres+pgvector, Redis, MinIO) with healthchecks — **done**
- Fastify + tRPC skeleton, module boundaries, `/health` + `/ready`, error handling — **done**
- React 19 + Tailwind v4 client shell with API client and health hook — **done**

Next phases: auth (JWT refresh flow already scaffolded via `JWT_*` env), domain modules, documents/payments integrations, AI orchestration (`src/modules/ai`) across the modules.