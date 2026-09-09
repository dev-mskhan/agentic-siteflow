import { z } from "zod";
import { router } from "../../api/trpc/trpc.js";
import { permissionProcedure } from "../../api/trpc/trpc.js";
import { Permissions } from "../auth/permissions.js";
import { auditRepository } from "./audit.repository.js";
import { AuditService } from "./audit.service.js";

const auditService = new AuditService(auditRepository);

export const auditRouter = router({
  /**
   * List audit logs for an organization.
   * Requires organization:read permission.
   */
  listByOrg: permissionProcedure(Permissions.ORGANIZATION_READ)
    .input(z.object({ orgId: z.string().min(1), limit: z.number().int().min(1).max(100).optional() }))
    .query(async ({ input }) => {
      return auditRepository.findByOrg(input.orgId, input.limit);
    }),

  /**
   * List audit logs for a specific entity using cursor-based pagination.
   * Requires organization:read permission.
   */
  listByEntity: permissionProcedure(Permissions.ORGANIZATION_READ)
    .input(
      z.object({
        entity: z.string().min(1),
        entityId: z.string().min(1),
        orgId: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().cuid().optional(),
      }),
    )
    .query(async ({ input }) => {
      return auditRepository.findByEntityCursor(input.entity, input.entityId, {
        limit: input.limit,
        cursor: input.cursor,
        orgId: input.orgId,
      });
    }),
});

// Export audit service singleton for use in other modules
export { auditService };
