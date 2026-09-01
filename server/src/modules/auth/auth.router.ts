import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../../api/trpc/trpc.js";
import { userRepository } from "../users/user.repository.js";
import { organizationRepository } from "../organizations/organization.repository.js";
import { jwtHelper } from "../../infrastructure/jwt/jwt.js";
import { sessionRepository } from "./session.repository.js";
import { AuthService } from "./auth.service.js";
import { ConflictError, UnauthorizedError, ValidationError } from "../../common/index.js";

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
  register: publicProcedure.input(registerSchema).mutation(async ({ input }) => {
    try {
      return await authService.register(input);
    } catch (err) {
      mapError(err);
    }
  }),

  login: publicProcedure.input(loginSchema).mutation(async ({ input }) => {
    try {
      return await authService.login(input);
    } catch (err) {
      mapError(err);
    }
  }),

  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        return await authService.refreshToken(input.refreshToken);
      } catch (err) {
        mapError(err);
      }
    }),

  logout: publicProcedure
    .input(z.object({ refreshToken: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        await authService.logout(input.refreshToken);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),
});
