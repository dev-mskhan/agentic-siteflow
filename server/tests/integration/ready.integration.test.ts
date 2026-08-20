import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { setupInfra } from '../../src/config';
import { loadEnv } from '../../src/config/env';

const runIntegration = process.env.RUN_INTEGRATION === '1';

describe.skipIf(!runIntegration)('infrastructure integration', () => {
  it('boots full infrastructure and reports ready', async () => {
    const env = loadEnv();
    const infra = await setupInfra(env);

    const app = buildApp({ env, logger: { level: 'silent' }, readyChecks: infra.readyChecks });
    const ready = await app.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: 'ready' });

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);

    await app.close();
    await infra.close();
  });
});
