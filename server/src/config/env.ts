import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    API_URL: z.string().min(1).default('http://localhost:4000/api'),
    CLIENT_URL: z.string().min(1).default('http://localhost:5173'),
    LOG_LEVEL: z.string().default('info'),

    POSTGRES_HOST: z.string().min(1).default('127.0.0.1'),
    POSTGRES_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
    POSTGRES_DATABASE: z.string().min(1).default('siteflow'),
    POSTGRES_USER: z.string().min(1).default('siteflow'),
    POSTGRES_PASSWORD: z.string().default('siteflow_dev_password'),
    POSTGRES_URL: z.string().optional(),

    REDIS_HOST: z.string().min(1).default('127.0.0.1'),
    REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
    REDIS_PASSWORD: z.string().default('siteflow_dev_redis'),
    REDIS_URL: z.string().optional(),

    S3_ENDPOINT: z.string().min(1).default('http://127.0.0.1:9000'),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(1).default('siteflow'),
    S3_ACCESS_KEY: z.string().min(1).default('siteflow_minio'),
    S3_SECRET_KEY: z.string().min(1).default('siteflow_minio_secret'),
    S3_FORCE_PATH_STYLE: z
      .string()
      .default('true')
      .transform((v) => v === 'true'),
    JWT_ACCESS_SECRET: z.string().min(1).default('dev_only_access_secret_change_me'),
    JWT_REFRESH_SECRET: z.string().min(1).default('dev_only_refresh_secret_change_me'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      const isPlaceholder = (s: string) =>
        s.startsWith('dev_') ||
        s.toLowerCase().includes('change_me') ||
        s.toLowerCase().includes('changeme');
      if (isPlaceholder(data.JWT_ACCESS_SECRET) || isPlaceholder(data.JWT_REFRESH_SECRET)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message: 'Production deployments must provide non-development JWT secrets.',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema> & {
  postgresUrl: string;
  redisUrl: string;
};

function findDotenvPath(): string | undefined {
  const candidates = [
    process.env.ENV_FILE,
    join(process.cwd(), '.env'),
    resolve(process.cwd(), '..', '.env'),
    resolve(process.cwd(), '..', '..', '.env'),
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => existsSync(p));
}

function buildEnv(parsed: z.infer<typeof envSchema>): Env {
  const postgresUrl =
    parsed.POSTGRES_URL ??
    `postgresql://${encodeURIComponent(parsed.POSTGRES_USER)}:${encodeURIComponent(parsed.POSTGRES_PASSWORD)}@${parsed.POSTGRES_HOST}:${parsed.POSTGRES_PORT}/${parsed.POSTGRES_DATABASE}`;

  const redisUrl =
    parsed.REDIS_URL ??
    `redis://:${encodeURIComponent(parsed.REDIS_PASSWORD)}@${parsed.REDIS_HOST}:${parsed.REDIS_PORT}/0`;

  return { ...parsed, postgresUrl, redisUrl };
}

export function parseEnv(input: Record<string, string | undefined> = {}): Env {
  const parsed = envSchema.safeParse(input);
  if (!parsed.success) {
    const summary = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${summary}`);
  }
  return buildEnv(parsed.data);
}

export function loadEnv(): Env {
  const dotenvPath = findDotenvPath();
  if (dotenvPath) {
    loadDotenv({ path: dotenvPath });
  }
  return parseEnv(process.env as Record<string, string>);
}
