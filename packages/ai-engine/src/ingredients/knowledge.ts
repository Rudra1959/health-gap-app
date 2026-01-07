export const INGREDIENT_DB: Record<
  string,
  {
    category: string;
    risk: "low" | "medium" | "high";
    effects: string[];
    safeNote: string;
  }
> = {
  sugar: {
    category: "sweetener",
    risk: "high",
    effects: ["spikes blood sugar", "increases insulin resistance"],
    safeNote: "Occasional intake is fine, avoid daily use.",
  },

  "palm oil": {
    category: "fat",
    risk: "medium",
    effects: ["high saturated fat", "heart health concern"],
    safeNote: "Better replaced with unsaturated fats.",
  },

  msg: {
    category: "additive",
    risk: "medium",
    effects: ["headaches in sensitive individuals"],
    safeNote: "Generally safe but avoid frequent intake.",
  },
};
