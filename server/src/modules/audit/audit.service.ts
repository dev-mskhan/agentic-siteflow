import type { AuditRepository } from "./audit.repository.js";
import type { AuditEntry } from "./audit.types.js";
import { logger } from "../../infrastructure/logger.js";

/**
 * Service for append-only audit logging.
 * Never throws — failures are logged but swallowed so they don't break core flows.
 */
export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.repo.create(entry);
    } catch (err) {
      // Fire-and-forget safety: audit failures must never break the primary flow
      logger.error({ err, entry }, "Failed to write audit log");
    }
  }
}
