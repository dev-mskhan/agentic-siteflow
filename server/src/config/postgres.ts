import { Pool } from 'pg';
import type { Env } from './env';

export function createPgPool(env: Env): Pool {
  return new Pool({
    connectionString: env.postgresUrl,
    max: env.NODE_ENV === 'test' ? 1 : 10,
    application_name: 'siteflow-server',
  });
}

export async function checkPostgres(pool: Pool): Promise<void> {
  await pool.query('SELECT 1');
}
