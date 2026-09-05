import { NotFoundError, ValidationError } from "../../common/index.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import type { IStorageService } from "../../infrastructure/storage/storage.interface.js";
import { storageService as defaultStorageService } from "../../infrastructure/storage/index.js";
import {
  documentRepository as defaultRepo,
  type DocumentRepository,
  type DocumentWithDetails,
} from "./document.repository.js";
import {
  DOCUMENT_AUDIT_ACTIONS,
  DOCUMENT_DOMAIN_EVENTS,
  type CreateDocumentInput,
  type AddDocumentVersionInput,
  type UpdateDocumentInput,
  type DocumentFilters,
  type DocumentLinkRecord,
} from "./document.types.js";

export class DocumentService {
  constructor(
    private readonly repo: DocumentRepository = defaultRepo,
    private readonly audit: AuditService = defaultAuditService,
    private readonly storage: IStorageService = defaultStorageService,
  ) {}

  /**
   * 6.1.8 — Create a new document with an initial version.
   */
  async createDocument(
    orgId: string,
    userId: string,
    input: CreateDocumentInput,
  ): Promise<DocumentWithDetails> {
    if (!input.title?.trim()) {
      throw new ValidationError("Document title is required");
    }
    if (!input.fileName?.trim()) {
      throw new ValidationError("File name is required");
    }
    if (!input.storageKey?.trim()) {
      throw new ValidationError("Storage key is required");
    }
    if (input.fileSize <= 0) {
      throw new ValidationError("File size must be greater than 0");
    }

    if (input.projectId) {
      const project = await this.repo.findProject(orgId, input.projectId);
      if (!project) {
        throw new NotFoundError("Project not found");
      }
    }

    const doc = await this.repo.create(orgId, userId, input);

    // Audit log
    await this.audit.log({
      orgId,
      userId,
      action: DOCUMENT_AUDIT_ACTIONS.DOCUMENT_CREATED,
      entity: "document",
      entityId: doc.id,
      newValue: {
        title: doc.title,
        documentNumber: doc.documentNumber,
        category: doc.category,
        currentVersion: doc.currentVersion,
        fileName: input.fileName,
      },
    });

    // Domain event
    await this.audit.log({
      orgId,
      userId,
      action: DOCUMENT_DOMAIN_EVENTS.DOCUMENT_UPLOADED,
      entity: "domain_event",
      entityId: doc.id,
      newValue: {
        documentId: doc.id,
        title: doc.title,
        version: 1,
        fileName: input.fileName,
        fileSize: input.fileSize,
      },
    });

    return doc;
  }

  /**
   * 6.1.8 — Add a new version to an existing document.
   */
  async addVersion(
    orgId: string,
    documentId: string,
    userId: string,
    input: AddDocumentVersionInput,
  ): Promise<DocumentWithDetails> {
    const existing = await this.repo.findById(orgId, documentId);
    if (!existing) {
      throw new NotFoundError("Document not found");
    }

    if (!input.fileName?.trim()) {
      throw new ValidationError("File name is required");
    }
    if (!input.storageKey?.trim()) {
      throw new ValidationError("Storage key is required");
    }
    if (input.fileSize <= 0) {
      throw new ValidationError("File size must be greater than 0");
    }

    const updated = await this.repo.addVersion(orgId, documentId, userId, input);

    // Audit log
    await this.audit.log({
      orgId,
      userId,
      action: DOCUMENT_AUDIT_ACTIONS.DOCUMENT_VERSION_ADDED,
      entity: "document",
      entityId: documentId,
      newValue: {
        versionNumber: updated.currentVersion,
        fileName: input.fileName,
        changeNotes: input.changeNotes,
      },
    });

    // Domain event
    await this.audit.log({
      orgId,
      userId,
      action: DOCUMENT_DOMAIN_EVENTS.DOCUMENT_UPLOADED,
      entity: "domain_event",
      entityId: documentId,
      newValue: {
        documentId,
        version: updated.currentVersion,
        fileName: input.fileName,
        fileSize: input.fileSize,
      },
    });

    return updated;
  }

  /**
   * 6.1.8 — Update document metadata.
   */
  async updateDocument(
    orgId: string,
    id: string,
    userId: string,
    input: UpdateDocumentInput,
  ): Promise<DocumentWithDetails> {
    const existing = await this.repo.findById(orgId, id);
    if (!existing) {
      throw new NotFoundError("Document not found");
    }

    const updated = await this.repo.update(orgId, id, input);

    await this.audit.log({
      orgId,
      userId,
      action: DOCUMENT_AUDIT_ACTIONS.DOCUMENT_UPDATED,
      entity: "document",
      entityId: id,
      oldValue: {
        title: existing.title,
        status: existing.status,
        category: existing.category,
      },
      newValue: {
        title: updated.title,
        status: updated.status,
        category: updated.category,
      },
    });

    return updated;
  }

  /**
   * 6.1.8 — Link document to any domain entity (e.g. TASK, RFI, SUBMITTAL).
   */
  async linkEntity(
    orgId: string,
    documentId: string,
    entityType: string,
    entityId: string,
    userId: string,
  ): Promise<DocumentLinkRecord> {
    const existing = await this.repo.findById(orgId, documentId);
    if (!existing) {
      throw new NotFoundError("Document not found");
    }

    const link = await this.repo.linkEntity(orgId, documentId, entityType, entityId, userId);

    await this.audit.log({
      orgId,
      userId,
      action: DOCUMENT_AUDIT_ACTIONS.DOCUMENT_LINKED,
      entity: "document",
      entityId: documentId,
      newValue: { entityType, entityId },
    });

    return link;
  }

  /**
   * 6.1.8 — Unlink document from an entity.
   */
  async unlinkEntity(
    orgId: string,
    documentId: string,
    entityType: string,
    entityId: string,
    userId: string,
  ): Promise<void> {
    const existing = await this.repo.findById(orgId, documentId);
    if (!existing) {
      throw new NotFoundError("Document not found");
    }

    await this.repo.unlinkEntity(orgId, documentId, entityType, entityId);

    await this.audit.log({
      orgId,
      userId,
      action: DOCUMENT_AUDIT_ACTIONS.DOCUMENT_UNLINKED,
      entity: "document",
      entityId: documentId,
      oldValue: { entityType, entityId },
    });
  }

  /**
   * 6.1.8 — Get document by ID with download URL for the latest version.
   */
  async getDocument(orgId: string, id: string): Promise<DocumentWithDetails & { downloadUrl?: string }> {
    const doc = await this.repo.findById(orgId, id);
    if (!doc) {
      throw new NotFoundError("Document not found");
    }

    let downloadUrl: string | undefined;
    const latestVersion = doc.versions[0];
    if (latestVersion) {
      downloadUrl = await this.storage.getDownloadUrl(
        latestVersion.storageBucket,
        latestVersion.storageKey,
      );
    }

    return { ...doc, downloadUrl };
  }

  /**
   * 6.1.8 — List documents with filtering and pagination.
   */
  async listDocuments(
    orgId: string,
    filters?: DocumentFilters,
  ): Promise<{ items: DocumentWithDetails[]; total: number }> {
    return this.repo.list(orgId, filters);
  }

  /**
   * 6.1.8 — Get documents linked to a specific entity.
   */
  async getDocumentsByEntity(
    orgId: string,
    entityType: string,
    entityId: string,
  ): Promise<DocumentWithDetails[]> {
    return this.repo.findByLinkedEntity(orgId, entityType, entityId);
  }

  /**
   * 6.1.8 — Archive a document.
   */
  async archiveDocument(orgId: string, id: string, userId: string): Promise<DocumentWithDetails> {
    const existing = await this.repo.findById(orgId, id);
    if (!existing) {
      throw new NotFoundError("Document not found");
    }

    const updated = await this.repo.update(orgId, id, { status: "ARCHIVED" });

    await this.audit.log({
      orgId,
      userId,
      action: DOCUMENT_AUDIT_ACTIONS.DOCUMENT_ARCHIVED,
      entity: "document",
      entityId: id,
    });

    return updated;
  }
}

export const documentService = new DocumentService();
