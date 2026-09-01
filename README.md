# SiteFlow AI

Construction operations OS for small and mid-sized contractors.

## Prerequisites

- [Node.js 22 LTS](https://nodejs.org/) (tested on v22.13.1)
- [pnpm 11](https://pnpm.io/) (tested on v11.9.0)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for local PostgreSQL and Redis)

## Local Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd siteflow
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

```bash
cp server/.env.example server/.env
```

Edit `server/.env` if needed. Defaults work with the Docker Compose setup below.

### 4. Start infrastructure (PostgreSQL + Redis)

```bash
docker compose up -d
```

Verify containers are healthy:

```bash
docker compose ps
```

### 5. Development server

```bash
pnpm dev
```

The server runs natively on the host (not in Docker).

### 6. Verify endpoints

```bash
curl http://localhost:3000/health
# {"status":"ok"}

curl http://localhost:3000/ready
# {"status":"ok","checks":{}}
```

---

## Scripts

All scripts run from the repo root via Turborepo. They cascade into each workspace package.

| Command | Description |
|---|---|
| `pnpm install` | Install all dependencies |
| `pnpm build` | Compile TypeScript |
| `pnpm typecheck` | Type-check without emitting |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format with Prettier |
| `pnpm format:check` | Check formatting without writing |
| `pnpm test` | Run all tests with Vitest |
| `pnpm dev` | Start server in watch mode |

### Run a script in a specific package only

```bash
pnpm --filter @siteflow/server build
pnpm --filter @siteflow/server test
```

---

## Project Structure

```
siteflow/
├── pnpm-workspace.yaml       # pnpm workspace config
├── turbo.json                # Turborepo pipeline
├── package.json              # Root (scripts only, no app code)
├── docker-compose.yml        # PostgreSQL + Redis (no app service)
├── README.md
└── server/                   # Backend package
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    ├── eslint.config.js
    ├── prisma/
    │   └── schema.prisma     # Datasource only (Phase 0)
    ├── src/
    │   ├── app/              # Express application factory
    │   ├── api/trpc/         # tRPC router, context, procedures
    │   ├── config/           # Zod-validated environment config
    │   ├── common/           # AppError and shared types
    │   ├── infrastructure/   # Logger (db/redis stubs added in 0.2/0.3)
    │   ├── middleware/       # requestId, security, 404, error handler
    │   ├── modules/          # Domain modules (added from Phase 1)
    │   ├── routes/           # REST health + ready endpoints
    │   └── server.ts         # Bootstrap: HTTP server + graceful shutdown
    └── tests/
        ├── setup.ts
        └── app.test.ts
```

---

## Technology Decisions

| Technology | Version | Reason |
|---|---|---|
| Node.js | 22.13.1 | Current Active LTS |
| TypeScript | 5.8.3 | Latest stable compatible with tRPC >=5.7.2 |
| Express | 5.2.1 | Current supported major |
| tRPC | 11.18.0 | Latest stable 11.x |
| Zod | 4.5.4 | Latest stable |
| Pino | 10.3.1 | Latest stable |
| Prisma | 7.10.0 | Latest stable (8.x RC excluded) |
| Vitest | 3.2.4 | Latest stable |
| Turborepo | 2.10.12 | Latest stable |

---

## Architecture Notes

- **Modular monolith** — all code in one deployable, organized by domain module
- **App factory** (`src/app/index.ts`) is separate from server bootstrap (`src/server.ts`) — enables clean testing
- **No business logic** in `server.ts` or tRPC procedures
- **tRPC** is the primary API for web client communication; `/health` and `/ready` are conventional REST
- **Pino** for structured JSON logging — no `console.log` anywhere
- **Zod** validates environment at startup; server refuses to start with invalid config
- **AppError** is the only mechanism for typed error propagation; raw errors are never exposed to clients
