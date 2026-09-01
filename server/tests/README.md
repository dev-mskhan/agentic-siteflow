# Test Organization

## Structure

```
tests/
  setup.ts           — env vars set before every test file
  unit/              — pure unit tests (no HTTP, DB, or Redis)
  utils/             — shared test utilities
  app.test.ts        — integration: Express app, /health, /ready, error handler
  infrastructure.test.ts — integration: CORS, rate-limit, middleware order, response contract
```

## Test Database Strategy

Integration tests that require a database use `siteflow_test` (configured in setup.ts).
Run `docker compose up -d` then `pnpm prisma migrate dev` before running integration tests
that hit the database.

Tests that do NOT require Docker:
- All unit tests in `tests/unit/`
- Integration tests in `tests/*.test.ts` (they accept 200 OR 503 on /ready)

## Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test -- --coverage
```
