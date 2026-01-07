const ALIAS_MAP: Record<string, string> = {
  "monosodium glutamate": "msg",
  e621: "msg",
  "sodium chloride": "salt",
  sucrose: "sugar",
};

export function normalizeIngredient(name: string): string {
  let normalized = name.toLowerCase().trim();

  // Remove E-numbers like E-202, INS 621
  normalized = normalized.replace(/(e|ins)[\s-]?\d+/gi, "").trim();

  if (ALIAS_MAP[normalized]) {
    return ALIAS_MAP[normalized];
  }

  return normalized;
}

export function normalizeIngredients(list: string[]): string[] {
  return list.map(normalizeIngredient).filter(Boolean);
}
