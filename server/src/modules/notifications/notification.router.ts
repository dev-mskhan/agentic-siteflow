import { z } from "zod";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { notificationService } from "./notification.service.js";
import { notificationRepository } from "./notification.repository.js";
import { TRPCError } from "@trpc/server";

export const notificationRouter = router({
  /**
   * List notifications for the authenticated user.
   * Supports optional isRead filter and offset-based pagination.
   */
  list: authedProcedure
    .input(
      z.object({
        isRead: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
        withCount: z.boolean().default(false).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return notificationService.list(ctx.user!.id, ctx.orgId!, {
        isRead: input.isRead,
        limit: input.limit,
        offset: input.offset,
        withCount: input.withCount,
      });
    }),

  /**
   * Cursor-based pagination for notifications.
   * Preferred over `list` for new consumers — scales better at high offsets.
   */
  listCursor: authedProcedure
    .input(
      z.object({
        isRead: z.boolean().optional(),
        take: z.number().int().min(1).max(100).default(20),
        cursor: z.string().cuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return notificationRepository.listCursor(ctx.user!.id, ctx.orgId!, {
        isRead: input.isRead,
        take: input.take,
        cursor: input.cursor,
      });
    }),

  /**
   * Mark a single notification as read.
   */
  markRead: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await notificationService.markRead(input.id, ctx.user!.id);
      return { success: true };
    }),

  /**
   * Mark all notifications as read for the authenticated user.
   */
  markAllRead: authedProcedure.mutation(async ({ ctx }) => {
    await notificationService.markAllRead(ctx.user!.id, ctx.orgId!);
    return { success: true };
  }),

  /**
   * Count unread notifications for the authenticated user.
   */
  countUnread: authedProcedure.query(async ({ ctx }) => {
    const count = await notificationService.countUnread(ctx.user!.id, ctx.orgId!);
    return { count };
  }),

  deliveryStats: authedProcedure.query(async ({ ctx }) => {
    if (ctx.user?.role !== "ADMIN") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
    }
    return notificationRepository.getDeliveryStats(ctx.orgId!);
  }),
});
