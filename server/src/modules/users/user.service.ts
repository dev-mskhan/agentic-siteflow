import { ConflictError, NotFoundError } from "../../common/index.js";
import type { UserRepository } from "./user.repository.js";
import type { CreateUserInput, UpdateUserInput, UserOutput } from "./user.types.js";

/**
 * Business-logic layer for Users.
 * Receives a repository through the constructor — easy to mock in tests.
 */
export class UserService {
  constructor(private readonly repo: UserRepository) {}

  async createUser(input: CreateUserInput): Promise<UserOutput> {
    // Always store email in lowercase for consistency
    const email = input.email.toLowerCase().trim();

    // Check email uniqueness
    const existing = await this.repo.findByEmail(email);
    if (existing) {
      throw new ConflictError(`Email "${email}" is already registered`);
    }

    return this.repo.create({ ...input, email });
  }

  async getUser(id: string): Promise<UserOutput> {
    const user = await this.repo.findById(id);
    if (!user) {
      throw new NotFoundError(`User not found`);
    }
    return user;
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<UserOutput> {
    // Ensure the user exists before updating
    const user = await this.repo.findById(id);
    if (!user) {
      throw new NotFoundError(`User not found`);
    }

    return this.repo.update(id, input);
  }
}
