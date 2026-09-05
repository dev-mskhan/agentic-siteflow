import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { DocumentCategory, DocumentStatus } from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { documentService } from "./document.service.js";
import { auditRepository } from "../audit/audit.repository.js";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../common/index.js";

function mapError(err: unknown): never {
  if (err instanceof NotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: err.message });
  }
  if (err instanceof ConflictError) {
    throw new TRPCError({ code: "CONFLICT", message: err.message });
  }
  if (err instanceof ValidationError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  }
  if (err instanceof UnauthorizedError) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: err.message });
  }
  if (err instanceof TRPCError) {
    throw err;
  }
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: err instanceof Error ? err.message : "Internal server error",
  });
}

const cuidSchema = z.string().regex(/^[a-z0-9]+$/i, "Invalid ID format");

export const createDocumentSchema = z.object({
  projectId: cuidSchema.optional(),
  title: z.string().min(1).max(255),
  documentNumber: z.string().max(100).optional(),
  category: z.nativeEnum(DocumentCategory).optional(),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().max(50)).optional(),
  isConfidential: z.boolean().optional(),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1).max(100),
  storageKey: z.string().min(1),
  storageBucket: z.string().optional(),
  checksum: z.string().optional(),
  changeNotes: z.string().max(1000).optional(),
  linkedEntityType: z.string().optional(),
  linkedEntityId: cuidSchema.optional(),
});

export const addDocumentVersionSchema = z.object({
  documentId: cuidSchema,
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1).max(100),
  storageKey: z.string().min(1),
  storageBucket: z.string().optional(),
  checksum: z.string().optional(),
  changeNotes: z.string().max(1000).optional(),
});

export const updateDocumentSchema = z.object({
  id: cuidSchema,
  title: z.string().min(1).max(255).optional(),
  documentNumber: z.string().max(100).optional(),
  category: z.nativeEnum(DocumentCategory).optional(),
  status: z.nativeEnum(DocumentStatus).optional(),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().max(50)).optional(),
  isConfidential: z.boolean().optional(),
});

export const linkDocumentSchema = z.object({
  documentId: cuidSchema,
  entityType: z.string().min(1).max(50),
  entityId: cuidSchema,
});

export const listDocumentsSchema = z.object({
  projectId: cuidSchema.optional(),
  category: z.nativeEnum(DocumentCategory).optional(),
  status: z.nativeEnum(DocumentStatus).optional(),
  search: z.string().max(100).optional(),
  tag: z.string().max(50).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const documentRouter = router({
  create: authedProcedure
    .input(createDocumentSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await documentService.createDocument(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  addVersion: authedProcedure
    .input(addDocumentVersionSchema)
    .mutation(async ({ ctx, input }) => {
      const { documentId, ...data } = input;
      try {
        return await documentService.addVersion(ctx.user!.orgId, documentId, ctx.user!.id, data);
      } catch (err) {
        mapError(err);
      }
    }),

  update: authedProcedure
    .input(updateDocumentSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      try {
        return await documentService.updateDocument(ctx.user!.orgId, id, ctx.user!.id, data);
      } catch (err) {
        mapError(err);
      }
    }),

  get: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await documentService.getDocument(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  list: authedProcedure
    .input(listDocumentsSchema.optional())
    .query(async ({ ctx, input }) => {
      try {
        return await documentService.listDocuments(ctx.user!.orgId, input);
      } catch (err) {
        mapError(err);
      }
    }),

  linkEntity: authedProcedure
    .input(linkDocumentSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await documentService.linkEntity(
          ctx.user!.orgId,
          input.documentId,
          input.entityType,
          input.entityId,
          ctx.user!.id,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  unlinkEntity: authedProcedure
    .input(linkDocumentSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await documentService.unlinkEntity(
          ctx.user!.orgId,
          input.documentId,
          input.entityType,
          input.entityId,
          ctx.user!.id,
        );
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  archive: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await documentService.archiveDocument(ctx.user!.orgId, input.id, ctx.user!.id);
      } catch (err) {
        mapError(err);
      }
    }),

  auditHistory: authedProcedure
    .input(
      z.object({
        documentId: cuidSchema,
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        await documentService.getDocument(ctx.user!.orgId, input.documentId);
        return await auditRepository.findByEntity(
          "document",
          input.documentId,
          input.limit,
          input.offset,
          ctx.user!.orgId,
        );
      } catch (err) {
        mapError(err);
      }
    }),
});
