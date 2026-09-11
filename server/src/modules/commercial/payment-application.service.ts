import { PaymentApplicationStatus, type PaymentApplication } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../common/AppError.js";
import { db } from "../../infrastructure/database/client.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import { projectRepository as defaultProjectRepository, type ProjectRepository } from "../projects/project.repository.js";
import { sovRepository as defaultSovRepository, type SovRepository } from "./sov.repository.js";
import {
  paymentApplicationRepository as defaultPaymentAppRepo,
  type PaymentApplicationRepository,
} from "./payment-application.repository.js";
import {
  PAYMENT_APPLICATION_AUDIT_ACTIONS,
  type CreatePaymentApplicationInput,
  type PaymentApplicationDetail,
  type PaymentApplicationFilters,
  type RejectPaymentApplicationInput,
} from "./payment-application.types.js";
import { assertNotSelfApprover } from "./segregation.guard.js";
import { notificationService } from "../notifications/notification.service.js";
import { enqueueNotificationDeliveries } from "../notifications/notification.queue.js";

export class PaymentApplicationService {
  constructor(
    private readonly appRepo: PaymentApplicationRepository = defaultPaymentAppRepo,
    private readonly sovRepo: SovRepository = defaultSovRepository,
    private readonly projectRepo: ProjectRepository = defaultProjectRepository,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  async create(
    orgId: string,
    userId: string,
    input: CreatePaymentApplicationInput,
  ): Promise<PaymentApplicationDetail> {
    const project = await this.projectRepo.findById(orgId, input.projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    const sov = await this.sovRepo.findById(orgId, input.sovId);
    if (!sov) {
      throw new NotFoundError("Schedule of values not found");
    }

    if (!input.lineItems || input.lineItems.length === 0) {
      throw new ValidationError("Payment application must contain line items");
    }

    // Fetch previous approved application to carry forward completed amounts
    const previousApp = await this.appRepo.getLatestApprovedApp(
      orgId,
      input.projectId,
      input.sovId,
      input.subcontractorId,
    );

    const app = await this.appRepo.create(orgId, userId, input, previousApp);

    await this.audit.log({
      orgId,
      userId,
      action: PAYMENT_APPLICATION_AUDIT_ACTIONS.PAYMENT_APPLICATION_CREATED,
      entity: "PaymentApplication",
      entityId: app.id,
      newValue: {
        applicationNumber: app.applicationNumber,
        currentPaymentDue: Number(app.currentPaymentDue),
        totalCompletedAndStored: Number(app.totalCompletedAndStored),
      },
    });

    return app;
  }

  async get(orgId: string, id: string): Promise<PaymentApplicationDetail> {
    const app = await this.appRepo.findById(orgId, id);
    if (!app) {
      throw new NotFoundError("Payment application not found");
    }
    return app;
  }

  async list(
    orgId: string,
    filters: PaymentApplicationFilters = {},
  ): Promise<PaymentApplicationDetail[]> {
    return this.appRepo.list(orgId, filters);
  }

  async submit(orgId: string, userId: string, id: string): Promise<PaymentApplication> {
    const app = await this.appRepo.findById(orgId, id);
    if (!app) {
      throw new NotFoundError("Payment application not found");
    }

    if (app.status !== PaymentApplicationStatus.DRAFT) {
      throw new ValidationError(`Cannot submit application in status '${app.status}'`);
    }

    const updated = await this.appRepo.updateStatus(id, {
      status: PaymentApplicationStatus.SUBMITTED,
      submittedAt: new Date(),
    });

    await this.audit.log({
      orgId,
      userId,
      action: PAYMENT_APPLICATION_AUDIT_ACTIONS.PAYMENT_APPLICATION_SUBMITTED,
      entity: "PaymentApplication",
      entityId: id,
      oldValue: { status: app.status },
      newValue: { status: updated.status },
    });

    return updated;
  }

  async approve(orgId: string, userId: string, id: string): Promise<PaymentApplication> {
    const app = await this.appRepo.findById(orgId, id);
    if (!app) {
      throw new NotFoundError("Payment application not found");
    }

    if (
      app.status !== PaymentApplicationStatus.SUBMITTED &&
      app.status !== PaymentApplicationStatus.UNDER_REVIEW
    ) {
      throw new ValidationError(`Cannot approve application in status '${app.status}'`);
    }

    // Segregation of duties: submitter cannot approve
    assertNotSelfApprover(app.submittedById, userId, "payment application");

    const result = await db.$transaction(async (tx) => {
      const approved = await this.appRepo.updateStatus(
        id,
        {
          status: PaymentApplicationStatus.APPROVED,
          approvedBy: { connect: { id: userId } },
          approvedAt: new Date(),
        },
        tx,
      );
      const amount = Number(app.currentPaymentDue).toFixed(2);
      const notification =
        app.submittedById !== userId
          ? await notificationService.create(
              {
                orgId,
                userId: app.submittedById,
                type: "PAYMENT_APP_APPROVED",
                title: "Payment Application Approved",
                body: `Payment Application #${app.applicationNumber} ($${amount}) has been approved.`,
                entityType: "PaymentApplication",
                entityId: id,
                dedupeKey: `PAYMENT_APP_APPROVED:${id}:${app.submittedById}`,
              },
              tx,
            )
          : null;
      return { approved, notification };
    });
    const approved = result.approved;

    await this.audit.log({
      orgId,
      userId,
      action: PAYMENT_APPLICATION_AUDIT_ACTIONS.PAYMENT_APPLICATION_APPROVED,
      entity: "PaymentApplication",
      entityId: id,
      oldValue: { status: app.status },
      newValue: { status: approved.status, approvedById: userId },
    });

    if (result.notification) {
      await enqueueNotificationDeliveries(result.notification.id);
    }

    return approved;
  }

  async reject(
    orgId: string,
    userId: string,
    input: RejectPaymentApplicationInput,
  ): Promise<PaymentApplication> {
    const app = await this.appRepo.findById(orgId, input.id);
    if (!app) {
      throw new NotFoundError("Payment application not found");
    }

    if (
      app.status !== PaymentApplicationStatus.SUBMITTED &&
      app.status !== PaymentApplicationStatus.UNDER_REVIEW
    ) {
      throw new ValidationError(`Cannot reject application in status '${app.status}'`);
    }

    // Segregation of duties
    assertNotSelfApprover(app.submittedById, userId, "payment application");

    const result = await db.$transaction(async (tx) => {
      const rejected = await this.appRepo.updateStatus(
        input.id,
        {
          status: PaymentApplicationStatus.REJECTED,
          rejectionReason: input.rejectionReason,
        },
        tx,
      );
      const notification =
        app.submittedById !== userId
          ? await notificationService.create(
              {
                orgId,
                userId: app.submittedById,
                type: "PAYMENT_APP_REJECTED",
                title: "Payment Application Rejected",
                body: `Payment Application #${app.applicationNumber} has been rejected.${input.rejectionReason ? ` Reason: ${input.rejectionReason}` : ""}`,
                entityType: "PaymentApplication",
                entityId: input.id,
                dedupeKey: `PAYMENT_APP_REJECTED:${input.id}:${app.submittedById}`,
              },
              tx,
            )
          : null;
      return { rejected, notification };
    });
    const rejected = result.rejected;

    await this.audit.log({
      orgId,
      userId,
      action: PAYMENT_APPLICATION_AUDIT_ACTIONS.PAYMENT_APPLICATION_REJECTED,
      entity: "PaymentApplication",
      entityId: input.id,
      oldValue: { status: app.status },
      newValue: { status: rejected.status, rejectionReason: input.rejectionReason },
    });

    if (result.notification) {
      await enqueueNotificationDeliveries(result.notification.id);
    }

    return rejected;
  }
}

export const paymentApplicationService = new PaymentApplicationService();
