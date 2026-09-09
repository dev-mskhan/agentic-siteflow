import { hash, verify as argon2Verify } from "@node-rs/argon2";
import { createHash, randomBytes } from "crypto";
import { db } from "../../infrastructure/database/client.js";
import { ConflictError, UnauthorizedError, ValidationError } from "../../common/index.js";
import type { JwtHelper } from "../../infrastructure/jwt/jwt.js";
import type { UserRepository } from "../users/user.repository.js";
import type { OrganizationRepository } from "../organizations/organization.repository.js";
import type { SessionRepository } from "./session.repository.js";
import type { RegisterInput, LoginInput, AuthTokens } from "./auth.types.js";
import { generateRefreshToken, parseExpiresIn } from "./auth.utils.js";
import { quotaService } from "./quota.service.js";
import { emailProvider } from "../../infrastructure/email/index.js";
import { renderPasswordResetEmail, renderEmailVerificationEmail } from "../../infrastructure/email/templates.js";
import { env } from "../../config/index.js";

/** SHA-256 hex hash of a raw token string. Raw token is never stored. */
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Generate a cryptographically secure URL-safe token (32 bytes = 64 hex chars). */
function generateSecureToken(): string {
  return randomBytes(32).toString("hex");
}

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

      await quotaService.seedDefaults(org.id, tx);

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

    // Send verification email — fire-and-forget, do not block registration on email errors
    this.sendVerificationEmail(result.user.id).catch(() => {
      // Silently ignore email send failures at registration time
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

    // Block unverified users — they must verify their email before logging in
    if (!userWithHash.emailVerified) {
      throw new UnauthorizedError(
        "Email address not verified. Check your inbox or request a new verification email.",
      );
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

  // ─── Password Reset ──────────────────────────────────────────────────────────

  /**
   * Initiates a password reset flow.
   *
   * Always returns void regardless of whether the email exists — prevents
   * email enumeration attacks. The raw token is sent to the user; only its
   * SHA-256 hash is stored in the database.
   */
  async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.userRepo.findByEmail(normalizedEmail);

    // Silently return if user not found — no information leak
    if (!user) return;

    // Generate token values before the transaction so rawToken is available
    // for the email URL after the transaction commits
    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Atomic: invalidate any existing unused tokens AND create the new one in
    // a single transaction — a crash between these two writes can no longer
    // leave the user in a state where all tokens are invalidated but no new
    // token exists (G22)
    await db.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
    });

    const resetUrl = `${env.APP_URL}/reset-password?token=${rawToken}`;
    const rendered = renderPasswordResetEmail(user.firstName, resetUrl);

    await emailProvider().send({
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }

  /**
   * Completes a password reset using the raw token sent to the user.
   *
   * On success:
   *  - Marks the token as used (single-use enforcement)
   *  - Updates the user's password hash
   *  - Revokes all active sessions (forces re-login on all devices)
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) {
      throw new ValidationError("Password must be at least 8 characters");
    }

    const tokenHash = hashToken(rawToken);
    const record = await db.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt !== null || record.expiresAt < new Date()) {
      throw new UnauthorizedError("Invalid or expired password reset token");
    }

    const newPasswordHash = await hash(newPassword);

    await db.$transaction([
      // Mark token as used
      db.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Update password
      db.user.update({
        where: { id: record.userId },
        data: { passwordHash: newPasswordHash },
      }),
      // Revoke all sessions — user must log in again on all devices
      db.session.updateMany({
        where: { userId: record.userId, isRevoked: false },
        data: { isRevoked: true },
      }),
    ]);
  }

  // ─── Email Verification ──────────────────────────────────────────────────────

  /**
   * Sends a verification email to a user.
   *
   * Invalidates any existing unused verification tokens first to ensure only
   * the most recent link is valid. Raw token goes to the user; only the hash
   * is stored.
   */
  async sendVerificationEmail(userId: string): Promise<void> {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return;

    // Already verified — nothing to do
    if (user.emailVerified) return;

    // Invalidate prior unused tokens
    await db.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    const verifyUrl = `${env.APP_URL}/verify-email?token=${rawToken}`;
    const rendered = renderEmailVerificationEmail(user.firstName, verifyUrl);

    await emailProvider().send({
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }

  /**
   * Verifies a user's email address using the raw token sent to them.
   *
   * On success:
   *  - Marks the token as used
   *  - Sets emailVerified = true on the user record
   */
  async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const record = await db.emailVerificationToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt !== null || record.expiresAt < new Date()) {
      throw new UnauthorizedError("Invalid or expired verification token");
    }

    await db.$transaction([
      db.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      db.user.update({
        where: { id: record.userId },
        data: { emailVerified: true },
      }),
    ]);
  }
}
