/**
 * Vitest global test setup.
 * Runs once before each test file.
 */

// Set test environment variables before any module is loaded
process.env["NODE_ENV"] = "test";
process.env["PORT"] = "3001";
process.env["LOG_LEVEL"] = "silent";
process.env["DATABASE_URL"] =
  "postgresql://siteflow:siteflow@localhost:5432/siteflow_test?schema=public";
process.env["REDIS_URL"] = "redis://localhost:6379";
process.env["JWT_SECRET"] = "test-secret-key-must-be-at-least-32-chars!!";
process.env["JWT_EXPIRES_IN"] = "15m";
process.env["REFRESH_TOKEN_EXPIRES_IN"] = "7d";
