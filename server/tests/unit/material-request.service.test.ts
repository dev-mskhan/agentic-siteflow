import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { MaterialRequest, MaterialRequestItem } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../src/common/index.js";
import {
  MaterialRequestService,
  type ProjectLookup,
} from "../../src/modules/procurement/material-request.service.js";
import type {
  MaterialRequestRepository,
  MaterialRequestWithItems,
} from "../../src/modules/procurement/material-request.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";

const ORG = "org_1";
const USER = "user_1";
const PROJECT = "proj_1";
const REQUEST_ID = "req_1";

function makeItem(overrides: Partial<MaterialRequestItem> = {}): MaterialRequestItem {
  return {
    id: "item_1",
    requestId: REQUEST_ID,
    materialId: null,
    description: "Portland Cement 50kg",
    quantity: new Prisma.Decimal(100),
    unit: "bag",
    estimatedUnitCost: new Prisma.Decimal(12),
    fulfilledQuantity: new Prisma.Decimal(0),
    costCodeId: null,
    linkedTaskId: null,
    linkedBoqItemId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRequest(overrides: Partial<MaterialRequest> = {}): MaterialRequestWithItems {
  return {
    id: REQUEST_ID,
    orgId: ORG,
    projectId: PROJECT,
    requestNumber: "MR-0001",
    title: "Foundation Materials",
    status: "DRAFT",
    priority: "MEDIUM",
    neededByDate: new Date("2026-10-01"),
    deliveryLocation: "Site A",
    notes: null,
    requestedById: USER,
    approvedById: null,
    approvedAt: null,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [makeItem()],
    ...overrides,
  };
}

describe("MaterialRequestService", () => {
  let service: MaterialRequestService;
  let mockRepo: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findByProject: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    addItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
    countByOrg: ReturnType<typeof vi.fn>;
    countItems: ReturnType<typeof vi.fn>;
  };
  let mockAudit: { log: ReturnType<typeof vi.fn> };
  let mockProjectLookup: ProjectLookup;

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByProject: vi.fn(),
      update: vi.fn(),
      addItem: vi.fn(),
      removeItem: vi.fn(),
      countByOrg: vi.fn(),
      countItems: vi.fn(),
    };
    mockAudit = { log: vi.fn().mockResolvedValue(undefined) };
    mockProjectLookup = {
      findById: vi.fn().mockResolvedValue({ id: PROJECT, status: "ACTIVE" }),
    };
    service = new MaterialRequestService(
      mockRepo as unknown as MaterialRequestRepository,
      mockAudit as unknown as AuditService,
      mockProjectLookup,
    );
  });

  describe("createRequest", () => {
    it("creates header and items in transaction with sequential MR-0001", async () => {
      const created = makeRequest();
      mockRepo.countByOrg.mockResolvedValue(0);
      mockRepo.create.mockResolvedValue(created);

      const result = await service.createRequest(ORG, PROJECT, USER, {
        title: "Foundation Materials",
        neededByDate: new Date("2026-10-01"),
        items: [
          {
            description: "Portland Cement 50kg",
            quantity: 100,
            unit: "bag",
            estimatedUnitCost: 12,
          },
        ],
      });

      expect(result.requestNumber).toBe("MR-0001");
      expect(mockRepo.create).toHaveBeenCalledWith(
        ORG,
        PROJECT,
        USER,
        "MR-0001",
        expect.objectContaining({ title: "Foundation Materials" }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "MATERIAL_REQUEST_CREATED",
          entity: "material_request",
        }),
      );
    });

    it("throws ValidationError if project is not ACTIVE", async () => {
      (mockProjectLookup.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: PROJECT,
        status: "COMPLETED",
      });

      await expect(
        service.createRequest(ORG, PROJECT, USER, {
          title: "Test",
          neededByDate: new Date("2026-10-01"),
          items: [{ description: "Item 1", quantity: 1, unit: "ea" }],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError if no items provided", async () => {
      await expect(
        service.createRequest(ORG, PROJECT, USER, {
          title: "Test",
          neededByDate: new Date("2026-10-01"),
          items: [],
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("submitRequest", () => {
    it("throws ValidationError if request has no items", async () => {
      const request = makeRequest({ items: [] });
      mockRepo.findById.mockResolvedValue(request);
      mockRepo.countItems.mockResolvedValue(0);

      await expect(
        service.submitRequest(ORG, REQUEST_ID, USER),
      ).rejects.toThrow(ValidationError);
    });

    it("transitions DRAFT to SUBMITTED when items exist", async () => {
      const request = makeRequest();
      mockRepo.findById.mockResolvedValue(request);
      mockRepo.countItems.mockResolvedValue(1);
      mockRepo.update.mockResolvedValue(makeRequest({ status: "SUBMITTED" }));

      const result = await service.submitRequest(ORG, REQUEST_ID, USER);

      expect(result.status).toBe("SUBMITTED");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "MATERIAL_REQUEST_SUBMITTED",
        }),
      );
    });
  });

  describe("approveRequest", () => {
    it("records approver and timestamp", async () => {
      const request = makeRequest({ status: "SUBMITTED" });
      mockRepo.findById.mockResolvedValue(request);
      const approved = makeRequest({
        status: "APPROVED",
        approvedById: USER,
        approvedAt: new Date(),
      });
      mockRepo.update.mockResolvedValue(approved);

      const result = await service.approveRequest(ORG, REQUEST_ID, USER);

      expect(result.status).toBe("APPROVED");
      expect(mockRepo.update).toHaveBeenCalledWith(
        ORG,
        REQUEST_ID,
        expect.objectContaining({
          status: "APPROVED",
          approvedById: USER,
          approvedAt: expect.any(Date) as Date,
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "MATERIAL_REQUEST_APPROVED",
          entityId: REQUEST_ID,
        }),
      );
    });

    it("throws ValidationError when trying to approve a DRAFT request", async () => {
      const request = makeRequest({ status: "DRAFT" });
      mockRepo.findById.mockResolvedValue(request);

      await expect(
        service.approveRequest(ORG, REQUEST_ID, USER),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("rejectRequest", () => {
    it("requires reason string", async () => {
      const request = makeRequest({ status: "SUBMITTED" });
      mockRepo.findById.mockResolvedValue(request);

      await expect(
        service.rejectRequest(ORG, REQUEST_ID, USER, ""),
      ).rejects.toThrow(ValidationError);
    });

    it("sets REJECTED status and rejection reason", async () => {
      const request = makeRequest({ status: "SUBMITTED" });
      mockRepo.findById.mockResolvedValue(request);
      mockRepo.update.mockResolvedValue(
        makeRequest({ status: "REJECTED", rejectionReason: "Budget exceeded" }),
      );

      const result = await service.rejectRequest(
        ORG,
        REQUEST_ID,
        USER,
        "Budget exceeded",
      );

      expect(result.status).toBe("REJECTED");
      expect(mockRepo.update).toHaveBeenCalledWith(
        ORG,
        REQUEST_ID,
        expect.objectContaining({
          status: "REJECTED",
          rejectionReason: "Budget exceeded",
        }),
      );
    });
  });

  describe("transition guards", () => {
    it("prevents editing already APPROVED request (transition to SUBMITTED)", async () => {
      const request = makeRequest({ status: "APPROVED" });
      mockRepo.findById.mockResolvedValue(request);

      await expect(
        service.submitRequest(ORG, REQUEST_ID, USER),
      ).rejects.toThrow(ValidationError);
    });

    it("prevents transitioning FULFILLED (terminal state)", async () => {
      const request = makeRequest({ status: "FULFILLED" });
      mockRepo.findById.mockResolvedValue(request);

      await expect(
        service.submitRequest(ORG, REQUEST_ID, USER),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("getRequest", () => {
    it("throws NotFoundError for non-existent request", async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.getRequest(ORG, "nonexistent"),
      ).rejects.toThrow(NotFoundError);
    });

    it("enforces tenant isolation", async () => {
      const request = makeRequest({ orgId: "other_org" });
      mockRepo.findById.mockResolvedValue(request);

      await expect(
        service.getRequest(ORG, REQUEST_ID),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
