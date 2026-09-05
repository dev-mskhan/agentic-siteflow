import type { Document, DocumentCategory, DocumentStatus, DocumentVersion, DocumentLink } from "@prisma/client";

export type DocumentRecord = Document;
export type DocumentVersionRecord = DocumentVersion;
export type DocumentLinkRecord = DocumentLink;

export interface CreateDocumentInput {
  projectId?: string;
  title: string;
  documentNumber?: string;
  category?: DocumentCategory;
  description?: string;
  tags?: string[];
  isConfidential?: boolean;
  // Initial version file info
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  storageBucket?: string;
  checksum?: string;
  changeNotes?: string;
  // Optional initial entity link
  linkedEntityType?: string;
  linkedEntityId?: string;
}

export interface AddDocumentVersionInput {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  storageBucket?: string;
  checksum?: string;
  changeNotes?: string;
}

export interface UpdateDocumentInput {
  title?: string;
  documentNumber?: string;
  category?: DocumentCategory;
  status?: DocumentStatus;
  description?: string;
  tags?: string[];
  isConfidential?: boolean;
}

export interface LinkDocumentEntityInput {
  documentId: string;
  entityType: string;
  entityId: string;
}

export interface DocumentFilters {
  projectId?: string;
  category?: DocumentCategory;
  status?: DocumentStatus;
  search?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

export const DOCUMENT_AUDIT_ACTIONS = {
  DOCUMENT_CREATED: "DOCUMENT_CREATED",
  DOCUMENT_UPDATED: "DOCUMENT_UPDATED",
  DOCUMENT_VERSION_ADDED: "DOCUMENT_VERSION_ADDED",
  DOCUMENT_STATUS_CHANGED: "DOCUMENT_STATUS_CHANGED",
  DOCUMENT_LINKED: "DOCUMENT_LINKED",
  DOCUMENT_UNLINKED: "DOCUMENT_UNLINKED",
  DOCUMENT_ARCHIVED: "DOCUMENT_ARCHIVED",
} as const;

export const DOCUMENT_DOMAIN_EVENTS = {
  DOCUMENT_UPLOADED: "DocumentUploaded",
} as const;
