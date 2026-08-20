import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp, type ReadyCheck } from '../src/app';
import { parseEnv } from '../src/config/env';

const env = parseEnv({ NODE_ENV: 'test' });
const logger = { level: 'silent' as const };

const apps: FastifyInstance[] = [];

function okChecks(): ReadyCheck[] {
  return [{ name: 'postgres', check: async () => {} }];
}

afterEach(async () => {
  await Promise.allSettled(apps.splice(0).map((app) => app.close()));
});

describe('application', () => {
  it('GET /health reports the process is alive', async () => {
    const app = buildApp({ env, logger, readyChecks: okChecks() });
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
    expect(typeof res.json().uptime).toBe('number');
  });

  it('GET /ready returns 200 when all dependencies are healthy', async () => {
    const app = buildApp({
      env,
      logger,
      readyChecks: [
        { name: 'postgres', check: async () => {} },
        { name: 'redis', check: async () => {} },
      ],
    });
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ready');
    expect(res.json().checks).toEqual(
      expect.arrayContaining([
        { name: 'postgres', status: 'ok' },
        { name: 'redis', status: 'ok' },
      ]),
    );
  });

  it('GET /ready returns 503 when a dependency is unreachable', async () => {
    const app = buildApp({
      env,
      logger,
      readyChecks: [
        { name: 'postgres', check: async () => {} },
        { name: 'redis', check: async () => Promise.reject(new Error('boom')) },
      ],
    });
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json().status).toBe('not_ready');
    expect(res.json().checks).toEqual(expect.arrayContaining([{ name: 'redis', status: 'error' }]));
  });

  it('GET /ready never leaks secrets', async () => {
    const failing = vi.fn(async () => {
      throw new Error('connection refused 127.0.0.1:5432 password=supersecret');
    });
    const app = buildApp({
      env,
      logger,
      readyChecks: [{ name: 'postgres', check: failing }],
    });
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain('supersecret');
  });

  it('sets a correlation/request id header on every response', async () => {
    const app = buildApp({ env, logger });
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('returns JSON 404 for unknown routes', async () => {
    const app = buildApp({ env, logger });
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('exposes registered modules through tRPC', async () => {
    const app = buildApp({ env, logger });
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/api/v1/app.status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().result.data.modules).toEqual(
      expect.arrayContaining(['auth', 'projects', 'tasks', 'ai']),
    );
  });
});
