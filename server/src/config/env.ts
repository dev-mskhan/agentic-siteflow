import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://siteflow:siteflow@localhost:5432/siteflow?schema=public"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  // CORS — comma-separated list of allowed origins
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000), // 1 minute
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100), // requests per window
  // JWT
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),
  // Storage
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  S3_ENDPOINT: z.string().default("localhost"),
  S3_PORT: z.coerce.number().int().min(1).max(65535).default(9000),
  S3_USE_SSL: z
    .string()
    .default("false")
    .transform((val) => val === "true"),
  S3_ACCESS_KEY: z.string().default("minioadmin"),
  S3_SECRET_KEY: z.string().default("minioadmin"),
  S3_BUCKET: z.string().default("siteflow-documents"),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((e) => `  ${e.path.map(String).join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }

  return result.data;
}

// Parsed at module load time — crashes immediately on invalid config.
export const env: Env = parseEnv();
