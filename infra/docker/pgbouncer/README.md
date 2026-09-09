# PgBouncer — Connection Pooler

PgBouncer sits in front of PostgreSQL and multiplexes many client connections
into a smaller number of actual database connections. This prevents connection
exhaustion when running multiple Node.js processes.

## Pool Stats

Connect to the PgBouncer admin console:
```bash
psql -h localhost -p 6432 -U pgbouncer pgbouncer
```

Useful commands:
```sql
SHOW POOLS;       -- connection pool status
SHOW STATS;       -- query throughput
SHOW CLIENTS;     -- connected clients
SHOW SERVERS;     -- server-side connections
SHOW CONFIG;      -- current config
```

## Configuration

| Setting | Value | Notes |
|---|---|---|
| pool_mode | transaction | Most efficient; DDL must use direct connection |
| max_client_conn | 200 | Max client connections to PgBouncer |
| default_pool_size | 20 | Server connections per database/user pair |
| reserve_pool_size | 5 | Extra connections for burst traffic |

## Important: Migrations

PgBouncer in `transaction` pool mode does NOT support DDL (CREATE TABLE, ALTER TABLE, etc.)
because each statement gets a different server connection.

Always run Prisma migrations against the direct connection:
```bash
DATABASE_URL=$DATABASE_URL_DIRECT pnpm --filter server db:migrate
```
