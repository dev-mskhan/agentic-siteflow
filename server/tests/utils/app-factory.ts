/**
 * Test app factory utility.
 *
 * Single import point for integration tests that need an Express app instance.
 * Wraps createApp() so tests never import directly from src/app — if the
 * factory signature changes, only this file needs updating.
 */

import { createApp } from "../../src/app/index.js";
import type { Express } from "express";

/**
 * Creates a fresh Express application configured for testing.
 * Each call returns an independent instance — no shared state between tests.
 */
export function createTestApp(): Express {
  return createApp();
}
