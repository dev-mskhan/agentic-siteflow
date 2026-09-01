/**
 * Unit tests for UserService.
 *
 * The repository is fully mocked — no database required.
 * Tests verify: email lowercasing, uniqueness enforcement,
 * not-found handling, and correct delegation to the repository.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserService } from "../../src/modules/users/user.service.js";
import type { UserRepository } from "../../src/modules/users/user.repository.js";
import { ConflictError, NotFoundError } from "../../src/common/AppError.js";
import type { CreateUserInput, UserOutput } from "../../src/modules/users/user.types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides?: Partial<UserOutput>): UserOutput {
  return {
    id: "user_1",
    email: "alice@example.com",
    emailVerified: false,
    firstName: "Alice",
    lastName: "Smith",
    avatarUrl: null,
    status: "ACTIVE",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makeMockRepo(overrides?: Partial<Record<keyof UserRepository, unknown>>): UserRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByEmail: vi.fn(),
    update: vi.fn(),
    ...overrides,
  } as unknown as UserRepository;
}

// ─── createUser ───────────────────────────────────────────────────────────────

describe("UserService.createUser", () => {
  let repo: UserRepository;
  let service: UserService;

  beforeEach(() => {
    repo = makeMockRepo({
      findByEmail: vi.fn().mockResolvedValue(null), // no conflict by default
      create: vi.fn().mockImplementation((input: CreateUserInput) =>
        Promise.resolve(makeUser({ email: input.email, firstName: input.firstName })),
      ),
    });
    service = new UserService(repo);
  });

  it("creates a user with valid input", async () => {
    const result = await service.createUser({
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Smith",
    });

    expect(result.email).toBe("alice@example.com");
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it("lowercases the email before storing", async () => {
    await service.createUser({
      email: "Alice@EXAMPLE.COM",
      firstName: "Alice",
      lastName: "Smith",
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "alice@example.com" }),
    );
  });

  it("trims whitespace from email before storing", async () => {
    await service.createUser({
      email: "  alice@example.com  ",
      firstName: "Alice",
      lastName: "Smith",
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "alice@example.com" }),
    );
  });

  it("throws ConflictError when email is already registered", async () => {
    vi.mocked(repo.findByEmail).mockResolvedValue(makeUser());

    await expect(
      service.createUser({ email: "alice@example.com", firstName: "Alice", lastName: "Smith" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("lowercases email before the uniqueness check", async () => {
    // Simulate: repo found when checking the lowercased version
    vi.mocked(repo.findByEmail).mockImplementation((email) => {
      if (email === "alice@example.com") return Promise.resolve(makeUser());
      return Promise.resolve(null);
    });

    await expect(
      service.createUser({ email: "Alice@Example.COM", firstName: "A", lastName: "S" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

// ─── getUser ──────────────────────────────────────────────────────────────────

describe("UserService.getUser", () => {
  it("returns the user when found", async () => {
    const user = makeUser();
    const repo = makeMockRepo({ findById: vi.fn().mockResolvedValue(user) });
    const service = new UserService(repo);

    const result = await service.getUser("user_1");
    expect(result).toEqual(user);
  });

  it("throws NotFoundError when user does not exist", async () => {
    const repo = makeMockRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new UserService(repo);

    await expect(service.getUser("nonexistent")).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── updateUser ───────────────────────────────────────────────────────────────

describe("UserService.updateUser", () => {
  it("updates the user when they exist", async () => {
    const updated = makeUser({ firstName: "Bob" });
    const repo = makeMockRepo({
      findById: vi.fn().mockResolvedValue(makeUser()),
      update: vi.fn().mockResolvedValue(updated),
    });
    const service = new UserService(repo);

    const result = await service.updateUser("user_1", { firstName: "Bob" });
    expect(result.firstName).toBe("Bob");
    expect(repo.update).toHaveBeenCalledWith("user_1", { firstName: "Bob" });
  });

  it("throws NotFoundError when user does not exist", async () => {
    const repo = makeMockRepo({
      findById: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    });
    const service = new UserService(repo);

    await expect(service.updateUser("nonexistent", { firstName: "Bob" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(repo.update).not.toHaveBeenCalled();
  });
});
