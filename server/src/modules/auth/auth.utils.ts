import { randomBytes } from "crypto";

/**
 * Generates a cryptographically secure random refresh token (64 hex chars = 32 bytes).
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Parses a duration string like "7d", "1h", "30m" into a future Date.
 */
export function parseExpiresIn(duration: string): Date {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) {
    throw new Error(`Invalid REFRESH_TOKEN_EXPIRES_IN format: ${duration}`);
  }

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;

  const ms: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return new Date(Date.now() + value * (ms[unit] ?? 0));
}
