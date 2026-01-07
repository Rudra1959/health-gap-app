export async function researchIngredients(ingredients: string[]) {
  return ingredients.map((i) => ({
    name: i,
    risk: i === "sugar" ? "high" : i === "palm oil" ? "medium" : "low",
    reason:
      i === "sugar" ? "High glycemic impact" : "Generally safe in moderation",
  }));
}
