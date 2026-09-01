import { hash, verify as argon2Verify } from "@node-rs/argon2";
import { db } from "../../infrastructure/database/client.js";
import { ConflictError, UnauthorizedError, ValidationError } from "../../common/index.js";
import type { JwtHelper } from "../../infrastructure/jwt/jwt.js";
import type { UserRepository } from "../users/user.repository.js";
import type { OrganizationRepository } from "../organizations/organization.repository.js";
import type { SessionRepository } from "./session.repository.js";
import type { RegisterInput, LoginInput, AuthTokens } from "./auth.types.js";
import { generateRefreshToken, parseExpiresIn } from "./auth.utils.js";

export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly orgRepo: OrganizationRepository,
    private readonly jwt: JwtHelper,
    private readonly sessionRepo: SessionRepository,
  ) {}

  async register(
    input: RegisterInput,
    context?: { ipAddress?: string; userAgent?: string },
  ): Promise<AuthTokens> {
    // Validate password length
    if (input.password.length < 8) {
      throw new ValidationError("Password must be at least 8 characters");
    }

    // Validate slug format
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(input.organizationSlug)) {
      throw new ValidationError(
        "Organization slug must contain only lowercase letters, numbers, and hyphens",
      );
    }

    const email = input.email.toLowerCase().trim();

    // Check email uniqueness before starting transaction
    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser) {
      throw new ConflictError("Email is already registered");
    }

    // Check slug uniqueness
    const existingOrg = await this.orgRepo.findBySlug(input.organizationSlug);
    if (existingOrg) {
      throw new ConflictError("Organization slug is already taken");
    }

    const passwordHash = await hash(input.password);

    // Create org + user + membership in a single transaction
    const result = await db.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: input.organizationName,
          slug: input.organizationSlug,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          firstName: input.firstName,
          lastName: input.lastName,
          passwordHash,
        },
      });

      await tx.organizationMember.create({
        data: {
          orgId: org.id,
          userId: user.id,
          role: "ADMIN",
        },
      });

      return { org, user };
    });

    const accessToken = this.jwt.sign({
      sub: result.user.id,
      orgId: result.org.id,
      email: result.user.email,
    });

    const refreshToken = generateRefreshToken();
    const expiresAt = parseExpiresIn(process.env["REFRESH_TOKEN_EXPIRES_IN"] ?? "7d");

    await this.sessionRepo.create({
      userId: result.user.id,
      orgId: result.org.id,
      refreshToken,
      expiresAt,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      },
      organization: {
        id: result.org.id,
        name: result.org.name,
        slug: result.org.slug,
      },
    };
  }

  async login(
    input: LoginInput,
    context?: { ipAddress?: string; userAgent?: string },
  ): Promise<AuthTokens> {
    const email = input.email.toLowerCase().trim();
    const GENERIC_ERROR = "Invalid email or password";

    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError(GENERIC_ERROR);
    }

    // User must have a password hash (not an OAuth-only account)
    const userWithHash = await db.user.findUnique({ where: { id: user.id } });
    if (!userWithHash?.passwordHash) {
      throw new UnauthorizedError(GENERIC_ERROR);
    }

    const valid = await argon2Verify(userWithHash.passwordHash, input.password);
    if (!valid) {
      throw new UnauthorizedError(GENERIC_ERROR);
    }

    // Find the user's primary organization (first membership)
    const membership = await db.organizationMember.findFirst({
      where: { userId: user.id },
      include: { organization: true },
    });

    if (!membership) {
      throw new UnauthorizedError(GENERIC_ERROR);
    }

    const accessToken = this.jwt.sign({
      sub: user.id,
      orgId: membership.orgId,
      email: user.email,
    });

    const refreshToken = generateRefreshToken();
    const expiresAt = parseExpiresIn(process.env["REFRESH_TOKEN_EXPIRES_IN"] ?? "7d");

    await this.sessionRepo.create({
      userId: user.id,
      orgId: membership.orgId,
      refreshToken,
      expiresAt,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
      },
    };
  }

  async refreshToken(token: string): Promise<AuthTokens> {
    const session = await this.sessionRepo.findByRefreshToken(token);

    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    // Rotate: revoke old session, create new one
    await this.sessionRepo.revoke(session.id);

    const newRefreshToken = generateRefreshToken();
    const expiresAt = parseExpiresIn(process.env["REFRESH_TOKEN_EXPIRES_IN"] ?? "7d");

    const newSession = await this.sessionRepo.create({
      userId: session.userId,
      orgId: session.orgId,
      refreshToken: newRefreshToken,
      expiresAt,
    });

    // Fetch user and org for the response
    const user = await db.user.findUniqueOrThrow({ where: { id: newSession.userId } });
    const org = await db.organization.findUniqueOrThrow({ where: { id: newSession.orgId } });

    const accessTokenFull = this.jwt.sign({
      sub: user.id,
      orgId: org.id,
      email: user.email,
    });

    return {
      accessToken: accessTokenFull,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const session = await this.sessionRepo.findByRefreshToken(refreshToken);
    if (session && !session.isRevoked) {
      await this.sessionRepo.revoke(session.id);
    }
    // Idempotent — no error if already revoked or not found
  }
}
