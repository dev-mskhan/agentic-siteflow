export interface BoqItemCalc {
  materialRate: number;
  laborRate: number;
  equipmentRate: number;
  subcontractorRate: number;
  quantity: number;
  directCostAmount: number;
}

// ─── Item-level calculations ──────────────────────────────────────────────────

export function calcDirectCostRate(
  materialRate: number,
  laborRate: number,
  equipmentRate: number,
  subcontractorRate: number,
): number {
  return materialRate + laborRate + equipmentRate + subcontractorRate;
}

export function calcDirectCostAmount(directCostRate: number, quantity: number): number {
  return directCostRate * quantity;
}

export function calcSellingRate(directCostRate: number, markupPercent: number): number {
  return directCostRate * (1 + markupPercent);
}

export function calcItemAmount(sellingRate: number, quantity: number): number {
  return sellingRate * quantity;
}

// ─── Estimate-level aggregation ───────────────────────────────────────────────

export function calcSubtotal(items: BoqItemCalc[]): number {
  return items.reduce((sum, item) => sum + item.directCostAmount, 0);
}

export function calcOverhead(subtotal: number, overheadPercent: number): number {
  return subtotal * overheadPercent;
}

export function calcContingency(subtotal: number, contingencyPercent: number): number {
  return subtotal * contingencyPercent;
}

export function calcTotalCost(subtotal: number, overhead: number, contingency: number): number {
  return subtotal + overhead + contingency;
}

export function calcMarkupAmount(totalCost: number, markupPercent: number): number {
  return totalCost * markupPercent;
}

export function calcSellingPrice(totalCost: number, markupAmount: number): number {
  return totalCost + markupAmount;
}

export function calcMargin(sellingPrice: number, totalCost: number): number {
  if (sellingPrice === 0) return 0;
  return (sellingPrice - totalCost) / sellingPrice;
}

// ─── Breakdown by cost type ───────────────────────────────────────────────────

export function calcMaterialSubtotal(items: BoqItemCalc[]): number {
  return items.reduce((sum, item) => sum + item.materialRate * item.quantity, 0);
}

export function calcLaborSubtotal(items: BoqItemCalc[]): number {
  return items.reduce((sum, item) => sum + item.laborRate * item.quantity, 0);
}

export function calcEquipmentSubtotal(items: BoqItemCalc[]): number {
  return items.reduce((sum, item) => sum + item.equipmentRate * item.quantity, 0);
}

export function calcSubcontractorSubtotal(items: BoqItemCalc[]): number {
  return items.reduce((sum, item) => sum + item.subcontractorRate * item.quantity, 0);
}
