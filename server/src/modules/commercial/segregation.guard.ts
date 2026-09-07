import { ForbiddenError } from "../../common/AppError.js";

/**
 * Segregation of Duties guard utility for financial actions.
 * Enforces that the actor initiating, creating, or requesting a financial
 * instrument cannot also approve it or record disbursements on it.
 */
export function assertNotSelfApprover(
  creatorId: string,
  approverId: string,
  itemType: string,
): void {
  if (creatorId === approverId) {
    throw new ForbiddenError(
      `Segregation of duties violation: The creator/requester of this ${itemType} cannot approve or finalize it.`,
    );
  }
}
