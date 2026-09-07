import { z } from "zod";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { notificationService } from "./notification.service.js";

export const notificationRouter = router({
  /**
   * List notifications for the authenticated user.
   * Supports optional isRead filter and pagination.
   */
  list: authedProcedure
    .input(
      z.object({
        isRead: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      return notificationService.list(ctx.user!.id, ctx.orgId!, {
        isRead: input.isRead,
        limit: input.limit,
        offset: input.offset,
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
});
