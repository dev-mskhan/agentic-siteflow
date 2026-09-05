import { NotFoundError, ValidationError } from "../../common/index.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import {
  complianceRepository as defaultRepo,
  type ComplianceRepository,
  type ComplianceRecordWithDetails,
} from "./compliance.repository.js";
import {
  COMPLIANCE_AUDIT_ACTIONS,
  COMPLIANCE_DOMAIN_EVENTS,
  type CreateComplianceRecordInput,
  type UpdateComplianceRecordInput,
  type ComplianceFilters,
} from "./compliance.types.js";

export class ComplianceService {
  constructor(
    private readonly repo: ComplianceRepository = defaultRepo,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  /**
   * 6.6.5 — Register a new compliance record (permit, license, insurance).
   */
  async createComplianceRecord(
    orgId: string,
    userId: string,
    input: CreateComplianceRecordInput,
  ): Promise<ComplianceRecordWithDetails> {
    if (!input.title?.trim()) {
      throw new ValidationError("Compliance title is required");
    }

    if (input.projectId) {
      const project = await this.repo.findProject(orgId, input.projectId);
      if (!project) {
        throw new NotFoundError("Project not found");
      }
    }

    if (input.subcontractorId) {
      const sub = await this.repo.findSubcontractor(orgId, input.subcontractorId);
      if (!sub) {
        throw new NotFoundError("Subcontractor not found");
      }
    }

    // Check if already expired at creation time
    let status = input.status ?? "ACTIVE";
    if (input.expirationDate && new Date(input.expirationDate) < new Date()) {
      status = "EXPIRED";
    }

    const record = await this.repo.create(orgId, userId, {
      ...input,
      status,
    });

    // Audit log
    await this.audit.log({
      orgId,
      userId,
      action: COMPLIANCE_AUDIT_ACTIONS.COMPLIANCE_RECORD_CREATED,
      entity: "compliance_record",
      entityId: record.id,
      newValue: {
        title: record.title,
        complianceType: record.complianceType,
        status: record.status,
        expirationDate: record.expirationDate,
        projectId: record.projectId,
      },
    });

    return record;
  }

  /**
   * 6.6.5 — Update a compliance record.
   */
  async updateComplianceRecord(
    orgId: string,
    id: string,
    userId: string,
    input: UpdateComplianceRecordInput,
  ): Promise<ComplianceRecordWithDetails> {
    const existing = await this.repo.findById(orgId, id);
    if (!existing) {
      throw new NotFoundError("Compliance record not found");
    }

    let status = input.status ?? existing.status;
    if (input.expirationDate && new Date(input.expirationDate) < new Date()) {
      status = "EXPIRED";
    }

    const updated = await this.repo.update(orgId, id, {
      ...input,
      status,
    });

    // Audit log
    await this.audit.log({
      orgId,
      userId,
      action: COMPLIANCE_AUDIT_ACTIONS.COMPLIANCE_RECORD_UPDATED,
      entity: "compliance_record",
      entityId: updated.id,
      oldValue: { status: existing.status, expirationDate: existing.expirationDate },
      newValue: { status: updated.status, expirationDate: updated.expirationDate },
    });

    return updated;
  }

  /**
   * 6.6.5 — Check and scan expiring compliance records, updating expired ones and emitting domain events.
   */
  async checkAndAlertExpiringRecords(
    orgId: string,
    windowDays = 30,
  ): Promise<{ scanned: number; alerted: number; expired: number }> {
    const records = await this.repo.findExpiring(orgId, windowDays);
    const now = new Date();
    let alerted = 0;
    let expired = 0;

    for (const record of records) {
      if (record.expirationDate && record.expirationDate < now) {
        await this.repo.update(orgId, record.id, { status: "EXPIRED" });
        await this.audit.log({
          orgId,
          userId: "system",
          action: COMPLIANCE_AUDIT_ACTIONS.COMPLIANCE_RECORD_EXPIRED,
          entity: "compliance_record",
          entityId: record.id,
          newValue: { status: "EXPIRED", expirationDate: record.expirationDate },
        });
        expired++;
      } else {
        // Active and expiring soon
        await this.audit.log({
          orgId,
          userId: "system",
          action: COMPLIANCE_DOMAIN_EVENTS.COMPLIANCE_RECORD_EXPIRING,
          entity: "domain_event",
          entityId: record.id,
          newValue: {
            complianceId: record.id,
            title: record.title,
            complianceType: record.complianceType,
            expirationDate: record.expirationDate,
            responsibleUserId: record.responsibleUserId,
          },
        });
        alerted++;
      }
    }

    return { scanned: records.length, alerted, expired };
  }

  async getComplianceRecord(orgId: string, id: string): Promise<ComplianceRecordWithDetails> {
    const record = await this.repo.findById(orgId, id);
    if (!record) {
      throw new NotFoundError("Compliance record not found");
    }
    return record;
  }

  async listComplianceRecords(
    orgId: string,
    filters?: ComplianceFilters,
  ): Promise<{ items: ComplianceRecordWithDetails[]; total: number }> {
    return this.repo.list(orgId, filters);
  }

  async getExpiringRecords(orgId: string, windowDays = 30): Promise<ComplianceRecordWithDetails[]> {
    return this.repo.findExpiring(orgId, windowDays);
  }
}

export const complianceService = new ComplianceService();
