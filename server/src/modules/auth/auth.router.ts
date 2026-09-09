import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, authedProcedure } from "../../api/trpc/trpc.js";
import { userRepository } from "../users/user.repository.js";
import { organizationRepository } from "../organizations/organization.repository.js";
import { jwtHelper } from "../../infrastructure/jwt/jwt.js";
import { sessionRepository } from "./session.repository.js";
import { AuthService } from "./auth.service.js";
import { ConflictError, UnauthorizedError, ValidationError } from "../../common/index.js";
import {
  isCookieMode,
  setAuthCookies,
  clearAuthCookies,
  getRefreshTokenCookie,
} from "../../infrastructure/cookies/auth-cookies.js";

const authService = new AuthService(
  userRepository,
  organizationRepository,
  jwtHelper,
  sessionRepository,
);

function mapError(err: unknown): never {
  if (err instanceof ConflictError)
    throw new TRPCError({ code: "CONFLICT", message: err.message });
  if (err instanceof UnauthorizedError)
    throw new TRPCError({ code: "UNAUTHORIZED", message: err.message });
  if (err instanceof ValidationError)
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  throw err;
}

const registerSchema = z.object({
  organizationName: z.string().min(1).max(100),
  organizationSlug: z.string().min(1).max(50),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRouter = router({
  register: publicProcedure.input(registerSchema).mutation(async ({ input, ctx }) => {
    try {
      const tokens = await authService.register(input);
      // 9.1 — set HttpOnly cookies if client opted in
      if (isCookieMode(ctx.req)) {
        setAuthCookies(ctx.res, tokens.accessToken, tokens.refreshToken);
      }
      return tokens;
    } catch (err) {
      mapError(err);
    }
  }),

  login: publicProcedure.input(loginSchema).mutation(async ({ input, ctx }) => {
    try {
      const tokens = await authService.login(input);
      // 9.1 — set HttpOnly cookies if client opted in
      if (isCookieMode(ctx.req)) {
        setAuthCookies(ctx.res, tokens.accessToken, tokens.refreshToken);
      }
      return tokens;
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * 9.4 — Refresh tokens.
   * In cookie mode: reads refreshToken from cookie (input.refreshToken is optional),
   * and writes new tokens back as cookies.
   * In JSON mode: reads/writes tokens in the request/response body as before.
   */
  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string().min(1).optional() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const cookieMode = isCookieMode(ctx.req);
        const refreshToken = input.refreshToken ?? getRefreshTokenCookie(ctx.req);

        if (!refreshToken) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Refresh token required" });
        }

        const tokens = await authService.refreshToken(refreshToken);

        if (cookieMode) {
          setAuthCookies(ctx.res, tokens.accessToken, tokens.refreshToken);
        }

        return tokens;
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * 9.3 — Logout.
   * In cookie mode: reads refreshToken from cookie (input.refreshToken is optional),
   * and clears both auth cookies.
   */
  logout: publicProcedure
    .input(z.object({ refreshToken: z.string().min(1).optional() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const cookieMode = isCookieMode(ctx.req);
        const refreshToken = input.refreshToken ?? getRefreshTokenCookie(ctx.req);

        if (refreshToken) {
          await authService.logout(refreshToken);
        }

        if (cookieMode) {
          clearAuthCookies(ctx.res);
        }

        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  // ─── Password Reset ───────────────────────────────────────────────────────

  /**
   * Request a password reset email.
   * Always returns success — never leaks whether the email exists.
   */
  forgotPassword: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      try {
        await authService.forgotPassword(input.email);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Complete a password reset using the raw token from the email link.
   */
  resetPassword: publicProcedure
    .input(z.object({ token: z.string().min(1), newPassword: z.string().min(8) }))
    .mutation(async ({ input }) => {
      try {
        await authService.resetPassword(input.token, input.newPassword);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  // ─── Email Verification ───────────────────────────────────────────────────

  /**
   * Verify an email address using the raw token from the verification link.
   */
  verifyEmail: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        await authService.verifyEmail(input.token);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Resend a verification email to the currently authenticated user.
   * No-ops if the user is already verified.
   */
  resendVerification: authedProcedure.mutation(async ({ ctx }) => {
    try {
      await authService.sendVerificationEmail(ctx.user!.id);
      return { success: true };
    } catch (err) {
      mapError(err);
    }
  }),
});
