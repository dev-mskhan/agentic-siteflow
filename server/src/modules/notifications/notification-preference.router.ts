import { z } from "zod";
import { NotificationType } from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { notificationPreferenceService } from "./notification-preference.service.js";

/**
 * Zod enum built from the Prisma NotificationType values.
 * Keeps the validation schema in sync with the DB enum automatically.
 */
const notificationTypeSchema = z.nativeEnum(NotificationType);

/**
 * Channel update input — inAppEnabled is intentionally excluded.
 * In-app notifications cannot be disabled; they are the primary record.
 */
const channelUpdateSchema = z.object({
  type: notificationTypeSchema,
  emailEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
});

export const notificationPreferenceRouter = router({
  /**
   * List all stored notification preferences for the current user.
   *
   * Types with no stored row are omitted (all channels default to enabled).
   * The client can infer "no row = all enabled" for display purposes.
   */
  list: authedProcedure.query(async ({ ctx }) => {
    return notificationPreferenceService.getPreferences(ctx.user!.id, ctx.orgId!);
  }),

  /**
   * Upsert a single notification type preference.
   * Only emailEnabled and whatsappEnabled can be changed.
   * inAppEnabled is always true and cannot be altered through this API.
   */
  update: authedProcedure.input(channelUpdateSchema).mutation(async ({ ctx, input }) => {
    const { type, ...channels } = input;
    return notificationPreferenceService.updatePreference(
      ctx.user!.id,
      ctx.orgId!,
      type,
      channels,
    );
  }),

  /**
   * Upsert multiple notification preferences in one call.
   * Useful for a "notification settings" page that saves all preferences at once.
   */
  bulkUpdate: authedProcedure
    .input(
      z.object({
        preferences: z
          .array(channelUpdateSchema)
          .min(1)
          .max(50, "Maximum 50 preferences per bulk update"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const results = await Promise.all(
        input.preferences.map(({ type, ...channels }) =>
          notificationPreferenceService.updatePreference(ctx.user!.id, ctx.orgId!, type, channels),
        ),
      );
      return { updated: results.length };
    }),
});
