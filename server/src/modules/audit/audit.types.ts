export interface AuditEntry {
  orgId?: string;
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}
