export const STANDARD_UNITS = {
  M2:  { code: "m2",   label: "Square Metre",  system: "metric"   as const },
  SQF: { code: "sqft", label: "Square Foot",   system: "imperial" as const },
  M3:  { code: "m3",   label: "Cubic Metre",   system: "metric"   as const },
  CYD: { code: "cyd",  label: "Cubic Yard",    system: "imperial" as const },
  M:   { code: "m",    label: "Metre",         system: "metric"   as const },
  FT:  { code: "ft",   label: "Foot",          system: "imperial" as const },
  HR:  { code: "hr",   label: "Hour",          system: "both"     as const },
  DAY: { code: "day",  label: "Day",           system: "both"     as const },
  WK:  { code: "wk",   label: "Week",          system: "both"     as const },
  NR:  { code: "nr",   label: "Number",        system: "both"     as const },
  LS:  { code: "ls",   label: "Lump Sum",      system: "both"     as const },
  KG:  { code: "kg",   label: "Kilogram",      system: "metric"   as const },
  TON: { code: "ton",  label: "Ton",           system: "imperial" as const },
  LOT: { code: "lot",  label: "Lot",           system: "both"     as const },
} as const;

export type UnitSystem = "metric" | "imperial" | "both";
export type UnitEntry = (typeof STANDARD_UNITS)[keyof typeof STANDARD_UNITS];

export function validateQuantity(value: number): boolean {
  if (value <= 0) return false;
  // max 6 decimal places
  const str = value.toString();
  const decimalIndex = str.indexOf(".");
  if (decimalIndex === -1) return true;
  return str.length - decimalIndex - 1 <= 6;
}

export function getUnitsForSystem(system: UnitSystem): UnitEntry[] {
  return Object.values(STANDARD_UNITS).filter(
    (u) => u.system === system || u.system === "both",
  );
}

export function getAllUnits(): UnitEntry[] {
  return Object.values(STANDARD_UNITS);
}
