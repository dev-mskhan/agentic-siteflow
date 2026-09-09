import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
  // Frontend URL — used to build password reset and email verification links
  APP_URL: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://siteflow:siteflow@localhost:5432/siteflow?schema=public"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  // Enable the Socket.IO Redis adapter for multi-instance deployments.
  // Set to true when running multiple server instances behind a load balancer.
  // Requires Redis to be available. Defaults to false (single-instance mode).
  REDIS_SOCKET_ADAPTER: z.coerce.boolean().default(false),
  // CORS — comma-separated list of allowed origins
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000), // 1 minute
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100), // requests per window
  // Per-tenant rate limiting (per organization, stacks on top of global limit)
  TENANT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  TENANT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1_000),
  // Per-tenant BullMQ job concurrency
  TENANT_JOB_CONCURRENCY_LIMIT: z.coerce.number().int().positive().default(5),
  // JWT
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),
  // Email
  EMAIL_PROVIDER: z.enum(["smtp", "sendgrid", "none"]).default("none"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("noreply@siteflow.local"),
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM: z.string().optional(),
  // WhatsApp
  WHATSAPP_PROVIDER: z.enum(["meta", "twilio", "none"]).default("none"),
  WHATSAPP_META_TOKEN: z.string().optional(),
  WHATSAPP_META_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_META_API_VERSION: z.string().default("v20.0"),
  WHATSAPP_TWILIO_ACCOUNT_SID: z.string().optional(),
  WHATSAPP_TWILIO_AUTH_TOKEN: z.string().optional(),
  WHATSAPP_TWILIO_FROM: z.string().optional(),
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
