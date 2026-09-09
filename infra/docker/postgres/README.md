# PostgreSQL Docker Configuration

## Files
- `postgresql.conf` — Custom PostgreSQL config (slow query logging, pg_stat_statements)
- `init.sql` — Run once on first container start (creates extensions)

## Applying Changes

Restart the stack to pick up config changes:
```bash
docker compose down
docker compose up -d
```

## Querying Slow Queries (pg_stat_statements)

After the container is running with the new config:
```sql
-- Top 20 slowest queries by mean execution time
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Queries with most total time (throughput hotspots)
SELECT query, calls, total_exec_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;

-- Reset stats
SELECT pg_stat_statements_reset();
```

Connect via: `psql postgresql://siteflow:siteflow@localhost:5433/siteflow`

## Slow Query Log

Queries taking >200ms are logged to the container stdout.
View with: `docker logs siteflow-postgres --follow`
