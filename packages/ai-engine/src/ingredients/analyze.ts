import { INGREDIENT_DB } from "./knowledge";

export function analyzeIngredients(ingredients: string[]) {
  return ingredients.map((name) => {
    const data = INGREDIENT_DB[name];

    if (!data) {
      return {
        name,
        category: "unknown",
        risk: "unknown",
        effects: ["Insufficient data"],
        safeNote: "No strong evidence available.",
      };
    }

    return { name, ...data };
  });
}

