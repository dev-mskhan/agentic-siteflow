-- SiteFlow PostgreSQL initialisation
-- Run once on first container start (docker-entrypoint-initdb.d)

-- Enable pg_stat_statements for query performance monitoring (Gap G24)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Enable pgvector (already in the base image but explicit is safer)
CREATE EXTENSION IF NOT EXISTS vector;
