import type { UserStatus } from "@prisma/client";

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateUserInput {
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  /** E.164 phone number (e.g. +14155552671), used for WhatsApp notifications */
  phone?: string | null;
  status?: UserStatus;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface UserOutput {
  id: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  /** E.164 phone number, nullable */
  phone: string | null;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Re-export enum for use within the module
export { UserStatus };
