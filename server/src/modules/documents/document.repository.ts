import type { Prisma, Document, DocumentVersion, DocumentLink } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type {
  CreateDocumentInput,
  AddDocumentVersionInput,
  UpdateDocumentInput,
  DocumentFilters,
} from "./document.types.js";

export type DocumentWithDetails = Document & {
  versions: DocumentVersion[];
  links: DocumentLink[];
};

export class DocumentRepository {
  async findById(orgId: string, id: string): Promise<DocumentWithDetails | null> {
    return db.document.findFirst({
      where: { id, orgId },
      include: {
        versions: { orderBy: { versionNumber: "desc" } },
        links: true,
      },
    });
  }

  async findProject(orgId: string, projectId: string) {
    return db.project.findFirst({
      where: { id: projectId, orgId },
      select: { id: true },
    });
  }

  async create(
    orgId: string,
    userId: string,
    input: CreateDocumentInput,
  ): Promise<DocumentWithDetails> {
    return db.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          orgId,
          projectId: input.projectId ?? null,
          title: input.title,
          documentNumber: input.documentNumber ?? null,
          category: input.category ?? "OTHER",
          status: "DRAFT",
          description: input.description ?? null,
          currentVersion: 1,
          tags: input.tags ?? [],
          isConfidential: input.isConfidential ?? false,
          createdById: userId,
          versions: {
            create: {
              orgId,
              versionNumber: 1,
              fileName: input.fileName,
              fileSize: input.fileSize,
              mimeType: input.mimeType,
              storageKey: input.storageKey,
              storageBucket: input.storageBucket ?? "default",
              checksum: input.checksum ?? null,
              changeNotes: input.changeNotes ?? "Initial version",
              uploadedById: userId,
            },
          },
          ...(input.linkedEntityType && input.linkedEntityId
            ? {
                links: {
                  create: {
                    orgId,
                    entityType: input.linkedEntityType,
                    entityId: input.linkedEntityId,
                    createdById: userId,
                  },
                },
              }
            : {}),
        },
        include: {
          versions: { orderBy: { versionNumber: "desc" } },
          links: true,
        },
      });

      return doc;
    });
  }

  async addVersion(
    orgId: string,
    documentId: string,
    userId: string,
    input: AddDocumentVersionInput,
  ): Promise<DocumentWithDetails> {
    return db.$transaction(async (tx) => {
      const doc = await tx.document.findFirstOrThrow({
        where: { id: documentId, orgId },
      });

      const nextVersionNumber = doc.currentVersion + 1;

      await tx.documentVersion.create({
        data: {
          documentId,
          orgId,
          versionNumber: nextVersionNumber,
          fileName: input.fileName,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
          storageKey: input.storageKey,
          storageBucket: input.storageBucket ?? "default",
          checksum: input.checksum ?? null,
          changeNotes: input.changeNotes ?? null,
          uploadedById: userId,
        },
      });

      const updated = await tx.document.update({
        where: { id: documentId },
        data: {
          currentVersion: nextVersionNumber,
          updatedAt: new Date(),
        },
        include: {
          versions: { orderBy: { versionNumber: "desc" } },
          links: true,
        },
      });

      return updated;
    });
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateDocumentInput,
  ): Promise<DocumentWithDetails> {
    const doc = await db.document.update({
      where: { id, orgId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.documentNumber !== undefined ? { documentNumber: input.documentNumber } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.isConfidential !== undefined ? { isConfidential: input.isConfidential } : {}),
      },
      include: {
        versions: { orderBy: { versionNumber: "desc" } },
        links: true,
      },
    });

    return doc;
  }

  async linkEntity(
    orgId: string,
    documentId: string,
    entityType: string,
    entityId: string,
    userId: string,
  ): Promise<DocumentLink> {
    return db.documentLink.upsert({
      where: {
        documentId_entityType_entityId: {
          documentId,
          entityType,
          entityId,
        },
      },
      update: {},
      create: {
        orgId,
        documentId,
        entityType,
        entityId,
        createdById: userId,
      },
    });
  }

  async unlinkEntity(orgId: string, documentId: string, entityType: string, entityId: string): Promise<void> {
    await db.documentLink.deleteMany({
      where: {
        orgId,
        documentId,
        entityType,
        entityId,
      },
    });
  }

  async list(
    orgId: string,
    filters?: DocumentFilters,
  ): Promise<{ items: DocumentWithDetails[]; total: number }> {
    const where: Prisma.DocumentWhereInput = {
      orgId,
      ...(filters?.projectId ? { projectId: filters.projectId } : {}),
      ...(filters?.category ? { category: filters.category } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.tag ? { tags: { has: filters.tag } } : {}),
      ...(filters?.search
        ? {
            OR: [
              { title: { contains: filters.search, mode: "insensitive" } },
              { documentNumber: { contains: filters.search, mode: "insensitive" } },
              { description: { contains: filters.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      db.document.findMany({
        where,
        include: {
          versions: { orderBy: { versionNumber: "desc" } },
          links: true,
        },
        orderBy: { updatedAt: "desc" },
        take: filters?.limit ?? 50,
        skip: filters?.offset ?? 0,
      }),
      db.document.count({ where }),
    ]);

    return { items, total };
  }

  async findByLinkedEntity(
    orgId: string,
    entityType: string,
    entityId: string,
  ): Promise<DocumentWithDetails[]> {
    const links = await db.documentLink.findMany({
      where: { orgId, entityType, entityId },
      include: {
        document: {
          include: {
            versions: { orderBy: { versionNumber: "desc" } },
            links: true,
          },
        },
      },
    });

    return links.map((l) => l.document);
  }

  async updateVersionChecksum(
    documentId: string,
    versionNumber: number,
    checksum: string,
  ) {
    return db.documentVersion.update({
      where: {
        documentId_versionNumber: {
          documentId,
          versionNumber,
        },
      },
      data: { checksum },
    });
  }
}

export const documentRepository = new DocumentRepository();
