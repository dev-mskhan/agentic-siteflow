import type { Prisma } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  OrganizationOutput,
} from "./organization.types.js";

/**
 * Repository layer for Organization model.
 * This is the ONLY place that directly calls Prisma for organizations.
 * Services must go through this layer — never access `db` directly.
 */
export class OrganizationRepository {
  async create(input: CreateOrganizationInput): Promise<OrganizationOutput> {
    return db.organization.create({
      data: {
        name: input.name,
        slug: input.slug,
        plan: input.plan ?? "free",
      },
    });
  }

  async findById(id: string): Promise<OrganizationOutput | null> {
    return db.organization.findUnique({ where: { id } });
  }

  async findBySlug(slug: string): Promise<OrganizationOutput | null> {
    return db.organization.findUnique({ where: { slug } });
  }

  async update(id: string, input: UpdateOrganizationInput): Promise<OrganizationOutput> {
    return db.organization.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.plan !== undefined && { plan: input.plan }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.settings !== undefined && { settings: input.settings as Prisma.InputJsonValue }),
      },
    });
  }

  async findAll(): Promise<OrganizationOutput[]> {
    return db.organization.findMany({ orderBy: { createdAt: "desc" } });
  }
}

// Singleton instance — import this in services
export const organizationRepository = new OrganizationRepository();
