import { NotFoundError } from "../../common/index.js";
import type { RateCardRepository } from "./rate-card.repository.js";
import type { AuditService } from "../audit/audit.service.js";
import { ESTIMATE_AUDIT_ACTIONS } from "./estimate.types.js";

export class RateCardService {
  constructor(
    private readonly repo: RateCardRepository,
    private readonly auditService: AuditService,
  ) {}

  async createRateCard(
    orgId: string,
    userId: string,
    input: { name: string; description?: string; currency?: string; effectiveDate?: Date },
  ) {
    const rateCard = await this.repo.create({ orgId, ...input });

    await this.auditService.log({
      orgId,
      userId,
      action: ESTIMATE_AUDIT_ACTIONS.RATE_CARD_CREATED,
      entity: "rate_card",
      entityId: rateCard.id,
      newValue: { name: rateCard.name },
    });

    return rateCard;
  }

  async listRateCards(orgId: string) {
    return this.repo.findByOrg(orgId);
  }

  async addRateCardItem(
    orgId: string,
    rateCardId: string,
    userId: string,
    input: {
      type: string;
      code?: string;
      description: string;
      unit: string;
      rate: number;
      notes?: string;
    },
  ) {
    const card = await this.repo.findById(rateCardId);
    if (!card || card.orgId !== orgId) {
      throw new NotFoundError("Rate card not found");
    }

    const item = await this.repo.addItem({ rateCardId, orgId, ...input });

    await this.auditService.log({
      orgId,
      userId,
      action: ESTIMATE_AUDIT_ACTIONS.RATE_CARD_ITEM_ADDED,
      entity: "rate_card",
      entityId: rateCardId,
      newValue: { itemId: item.id, description: input.description },
    });

    return item;
  }

  async updateRateCardItem(
    orgId: string,
    rateCardId: string,
    itemId: string,
    userId: string,
    input: Partial<{
      type: string;
      code: string;
      description: string;
      unit: string;
      rate: number;
      notes: string;
    }>,
  ) {
    const card = await this.repo.findById(rateCardId);
    if (!card || card.orgId !== orgId) {
      throw new NotFoundError("Rate card not found");
    }

    const item = await this.repo.findItemById(itemId);
    if (!item || item.rateCardId !== rateCardId) {
      throw new NotFoundError("Rate card item not found");
    }

    const updated = await this.repo.updateItem(itemId, input);

    await this.auditService.log({
      orgId,
      userId,
      action: ESTIMATE_AUDIT_ACTIONS.RATE_CARD_ITEM_ADDED,
      entity: "rate_card",
      entityId: rateCardId,
      newValue: { itemId, ...input },
    });

    return updated;
  }

  async deactivateRateCard(orgId: string, rateCardId: string, userId: string) {
    const card = await this.repo.findById(rateCardId);
    if (!card || card.orgId !== orgId) {
      throw new NotFoundError("Rate card not found");
    }

    const updated = await this.repo.deactivate(rateCardId);

    await this.auditService.log({
      orgId,
      userId,
      action: ESTIMATE_AUDIT_ACTIONS.RATE_CARD_DEACTIVATED,
      entity: "rate_card",
      entityId: rateCardId,
    });

    return updated;
  }
}
