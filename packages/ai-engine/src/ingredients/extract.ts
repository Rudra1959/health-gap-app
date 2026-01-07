export function extractIngredientsFromText(text: string): string[] {
  if (!text) return [];

  return text
    .replace(/ingredients[:]?/i, "")
    .split(/,|\n|;/)
    .map((i) => i.trim())
    .filter((i) => i.length > 1);
}

