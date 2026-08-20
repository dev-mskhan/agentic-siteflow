import { describe, expect, it } from 'vitest';
import { loadEnv, parseEnv } from '../src/config/env';

describe('environment configuration', () => {
  it('parses with safe development defaults', () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.postgresUrl).toContain('postgresql://');
    expect(env.redisUrl).toContain('redis://');
  });

  it('derives connection URLs from individual settings', () => {
    const env = parseEnv({
      POSTGRES_HOST: 'db.example.com',
      POSTGRES_PORT: '5433',
      POSTGRES_USER: 'user',
      POSTGRES_PASSWORD: 'p@ss',
      POSTGRES_DATABASE: 'siteflow',
      REDIS_HOST: 'cache.example.com',
      REDIS_PASSWORD: 'redis-pass',
    });
    expect(env.postgresUrl).toBe('postgresql://user:p%40ss@db.example.com:5433/siteflow');
    expect(env.redisUrl).toBe('redis://:redis-pass@cache.example.com:6379/0');
  });

  it('prefers explicit connection URLs when provided', () => {
    const env = parseEnv({ POSTGRES_URL: 'postgresql://custom@custom:5555/custom' });
    expect(env.postgresUrl).toBe('postgresql://custom@custom:5555/custom');
  });

  it('rejects invalid values', () => {
    expect(() => parseEnv({ PORT: 'not-a-number' })).toThrow(/Invalid environment configuration/);
    expect(() => parseEnv({ BCRYPT_ROUNDS: '2' })).toThrow(/Invalid environment configuration/);
  });

  it('rejects non-production modes? no — rejects only invalid values', () => {
    expect(() => parseEnv({ NODE_ENV: 'staging' })).toThrow(/Invalid environment configuration/);
  });

  it('rejects development JWT secrets in production', () => {
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(/Invalid environment configuration/);
    expect(() =>
      parseEnv({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'dev_only_access_secret_change_me' }),
    ).toThrow(/non-development JWT secrets/);
  });

  it('accepts strong secrets in production', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a-very-long-production-access-secret-0123456789',
      JWT_REFRESH_SECRET: 'a-very-long-production-refresh-secret-9876543210',
    });
    expect(env.NODE_ENV).toBe('production');
  });

  it('loadEnv resolves without a .env file present', () => {
    const env = loadEnv();
    expect(env).toBeDefined();
    expect(env.NODE_ENV).toBeTruthy();
  });
});
