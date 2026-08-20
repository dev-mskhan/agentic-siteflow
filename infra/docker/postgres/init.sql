-- SiteFlow AI — PostgreSQL bootstrap (runs once on first volume initialization).
-- Enables the pgvector extension required by the AI document/vector layer (Phase B).

CREATE EXTENSION IF NOT EXISTS vector;

-- Vector search works against a dedicated schema kept separate from operational data.
CREATE SCHEMA IF NOT EXISTS vectors;