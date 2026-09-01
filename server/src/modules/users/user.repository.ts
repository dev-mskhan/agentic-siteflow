import { db } from "../../infrastructure/database/client.js";
import type { CreateUserInput, UpdateUserInput, UserOutput } from "./user.types.js";

/**
 * Repository layer for User model.
 * This is the ONLY place that directly calls Prisma for users.
 */
export class UserRepository {
  async create(input: CreateUserInput): Promise<UserOutput> {
    return db.user.create({
      data: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        avatarUrl: input.avatarUrl,
      },
    });
  }

  async findById(id: string): Promise<UserOutput | null> {
    return db.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<UserOutput | null> {
    return db.user.findUnique({ where: { email } });
  }

  async update(id: string, input: UpdateUserInput): Promise<UserOutput> {
    return db.user.update({
      where: { id },
      data: {
        ...(input.firstName !== undefined && { firstName: input.firstName }),
        ...(input.lastName !== undefined && { lastName: input.lastName }),
        ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
        ...(input.status !== undefined && { status: input.status }),
      },
    });
  }
}

// Singleton instance — import this in services
export const userRepository = new UserRepository();
