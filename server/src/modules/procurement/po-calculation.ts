import { Prisma } from "@prisma/client";

export type DecimalValue = number | string | Prisma.Decimal;

export function toDecimal(val: DecimalValue): Prisma.Decimal {
  if (val instanceof Prisma.Decimal) {
    return val;
  }
  return new Prisma.Decimal(val);
}

/**
 * Calculates item total price: quantity * unitPrice, rounded to 4 decimal places.
 */
export function calcItemTotal(quantity: DecimalValue, unitPrice: DecimalValue): Prisma.Decimal {
  const q = toDecimal(quantity);
  const p = toDecimal(unitPrice);
  return q.mul(p).toDecimalPlaces(4);
}

/**
 * Calculates PO subtotal as sum of item total prices.
 */
export function calcPoSubtotal(
  items: Array<{ quantity: DecimalValue; unitPrice: DecimalValue }>,
): Prisma.Decimal {
  return items.reduce((sum, item) => {
    return sum.add(calcItemTotal(item.quantity, item.unitPrice));
  }, new Prisma.Decimal(0)).toDecimalPlaces(4);
}

/**
 * Calculates tax amount: subtotal * taxRate, rounded to 4 decimal places.
 */
export function calcTaxAmount(subtotal: DecimalValue, taxRate: DecimalValue): Prisma.Decimal {
  const sub = toDecimal(subtotal);
  const rate = toDecimal(taxRate);
  return sub.mul(rate).toDecimalPlaces(4);
}

/**
 * Calculates grand total: subtotal + taxAmount + shippingAmount, rounded to 4 decimal places.
 */
export function calcPoTotal(
  subtotal: DecimalValue,
  taxAmount: DecimalValue,
  shippingAmount: DecimalValue = 0,
): Prisma.Decimal {
  const sub = toDecimal(subtotal);
  const tax = toDecimal(taxAmount);
  const shipping = toDecimal(shippingAmount);
  return sub.add(tax).add(shipping).toDecimalPlaces(4);
}
