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
