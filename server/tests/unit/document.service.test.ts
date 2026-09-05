import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "../../src/common/index.js";
import { DocumentService } from "../../src/modules/documents/document.service.js";
import type { DocumentRepository, DocumentWithDetails } from "../../src/modules/documents/document.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";
import type { IStorageService } from "../../src/infrastructure/storage/storage.interface.js";

const ORG = "org_1";
const USER = "user_1";
const PROJECT_ID = "proj_1";
const DOC_ID = "doc_1";

function makeDoc(overrides: Partial<DocumentWithDetails> = {}): DocumentWithDetails {
  return {
    id: DOC_ID,
    orgId: ORG,
    projectId: PROJECT_ID,
    title: "Structural Plan",
    documentNumber: "DWG-001",
    category: "DRAWING",
    status: "DRAFT",
    description: "Main Foundation",
    currentVersion: 1,
    tags: ["structural", "foundation"],
    isConfidential: false,
    createdById: USER,
    createdAt: new Date(),
    updatedAt: new Date(),
    versions: [
      {
        id: "ver_1",
        documentId: DOC_ID,
        orgId: ORG,
        versionNumber: 1,
        fileName: "foundation-rev0.pdf",
        fileSize: 102400,
        mimeType: "application/pdf",
        storageKey: "documents/foundation-rev0.pdf",
        storageBucket: "default",
        checksum: "abc123hash",
        changeNotes: "Initial version",
        uploadedById: USER,
        createdAt: new Date(),
      },
    ],
    links: [],
    ...overrides,
  };
}

describe("DocumentService", () => {
  let service: DocumentService;
  let mockRepo: {
    findById: ReturnType<typeof vi.fn>;
    findProject: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    addVersion: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    linkEntity: ReturnType<typeof vi.fn>;
    unlinkEntity: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    findByLinkedEntity: ReturnType<typeof vi.fn>;
  };
  let mockAudit: { log: ReturnType<typeof vi.fn> };
  let mockStorage: {
    upload: ReturnType<typeof vi.fn>;
    getDownloadUrl: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    getMetadata: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRepo = {
      findById: vi.fn(),
      findProject: vi.fn(),
      create: vi.fn(),
      addVersion: vi.fn(),
      update: vi.fn(),
      linkEntity: vi.fn(),
      unlinkEntity: vi.fn(),
      list: vi.fn(),
      findByLinkedEntity: vi.fn(),
    };
    mockAudit = { log: vi.fn().mockResolvedValue(undefined) };
    mockStorage = {
      upload: vi.fn(),
      getDownloadUrl: vi.fn().mockResolvedValue("/storage/default/key"),
      exists: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
      getMetadata: vi.fn(),
    };

    service = new DocumentService(
      mockRepo as unknown as DocumentRepository,
      mockAudit as unknown as AuditService,
      mockStorage as unknown as IStorageService,
    );
  });

  describe("createDocument", () => {
    it("validates required fields (title, fileName, storageKey, fileSize)", async () => {
      await expect(
        service.createDocument(ORG, USER, {
          title: "",
          fileName: "test.pdf",
          fileSize: 100,
          mimeType: "application/pdf",
          storageKey: "key",
        }),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.createDocument(ORG, USER, {
          title: "Title",
          fileName: "test.pdf",
          fileSize: 0,
          mimeType: "application/pdf",
          storageKey: "key",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("verifies project belongs to org when projectId provided", async () => {
      mockRepo.findProject.mockResolvedValue(null);

      await expect(
        service.createDocument(ORG, USER, {
          projectId: "nonexistent",
          title: "Title",
          fileName: "test.pdf",
          fileSize: 100,
          mimeType: "application/pdf",
          storageKey: "key",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("creates document, logs audit entry and emits DocumentUploaded domain event", async () => {
      const doc = makeDoc();
      mockRepo.findProject.mockResolvedValue({ id: PROJECT_ID });
      mockRepo.create.mockResolvedValue(doc);

      const result = await service.createDocument(ORG, USER, {
        projectId: PROJECT_ID,
        title: "Structural Plan",
        fileName: "foundation-rev0.pdf",
        fileSize: 102400,
        mimeType: "application/pdf",
        storageKey: "documents/foundation-rev0.pdf",
      });

      expect(result.id).toBe(DOC_ID);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DOCUMENT_CREATED",
          entity: "document",
          entityId: DOC_ID,
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DocumentUploaded",
          entity: "domain_event",
          entityId: DOC_ID,
        }),
      );
    });
  });

  describe("addVersion", () => {
    it("increments version number and emits DocumentUploaded event", async () => {
      const doc = makeDoc();
      const updatedDoc = makeDoc({
        currentVersion: 2,
        versions: [
          {
            id: "ver_2",
            documentId: DOC_ID,
            orgId: ORG,
            versionNumber: 2,
            fileName: "foundation-rev1.pdf",
            fileSize: 105000,
            mimeType: "application/pdf",
            storageKey: "documents/foundation-rev1.pdf",
            storageBucket: "default",
            checksum: "newhash",
            changeNotes: "Added column details",
            uploadedById: USER,
            createdAt: new Date(),
          },
          ...doc.versions,
        ],
      });

      mockRepo.findById.mockResolvedValue(doc);
      mockRepo.addVersion.mockResolvedValue(updatedDoc);

      const result = await service.addVersion(ORG, DOC_ID, USER, {
        fileName: "foundation-rev1.pdf",
        fileSize: 105000,
        mimeType: "application/pdf",
        storageKey: "documents/foundation-rev1.pdf",
        changeNotes: "Added column details",
      });

      expect(result.currentVersion).toBe(2);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DOCUMENT_VERSION_ADDED",
          entity: "document",
          entityId: DOC_ID,
        }),
      );
    });
  });

  describe("linkEntity and unlinkEntity", () => {
    it("links document to a task/RFI/submittal entity and logs audit", async () => {
      mockRepo.findById.mockResolvedValue(makeDoc());
      mockRepo.linkEntity.mockResolvedValue({
        id: "link_1",
        documentId: DOC_ID,
        orgId: ORG,
        entityType: "TASK",
        entityId: "task_123",
        createdById: USER,
        createdAt: new Date(),
      });

      const link = await service.linkEntity(ORG, DOC_ID, "TASK", "task_123", USER);

      expect(link.entityType).toBe("TASK");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DOCUMENT_LINKED",
          entity: "document",
          entityId: DOC_ID,
        }),
      );
    });

    it("unlinks document and logs audit", async () => {
      mockRepo.findById.mockResolvedValue(makeDoc());
      mockRepo.unlinkEntity.mockResolvedValue(undefined);

      await service.unlinkEntity(ORG, DOC_ID, "TASK", "task_123", USER);

      expect(mockRepo.unlinkEntity).toHaveBeenCalledWith(ORG, DOC_ID, "TASK", "task_123");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DOCUMENT_UNLINKED",
          entity: "document",
          entityId: DOC_ID,
        }),
      );
    });
  });

  describe("getDocument", () => {
    it("returns document along with presigned download URL", async () => {
      mockRepo.findById.mockResolvedValue(makeDoc());

      const result = await service.getDocument(ORG, DOC_ID);

      expect(result.id).toBe(DOC_ID);
      expect(result.downloadUrl).toBe("/storage/default/key");
      expect(mockStorage.getDownloadUrl).toHaveBeenCalled();
    });

    it("throws NotFoundError when document does not exist", async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.getDocument(ORG, "nonexistent")).rejects.toThrow(NotFoundError);
    });
  });
});
