export function cleanJson(text: string): string {
  const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  
  if (firstBrace !== -1 && lastBrace !== -1) {
    return cleaned.substring(firstBrace, lastBrace + 1);
  }
  
  return cleaned;
}

export function parseIngredientList(text: string): string[] {
  if (!text) return [];

  const ingredients: string[] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === "(" || char === "[" || char === "{") {
      depth++;
    } else if (char === ")" || char === "]" || char === "}") {
      depth--;
    }

    if (char === "," && depth === 0) {
      ingredients.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    ingredients.push(current.trim());
  }

  return ingredients.filter((i) => i.length > 0);
}
