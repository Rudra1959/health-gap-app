import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ScanRequestSchema } from "@repo/shared";

import {
  visionAgent,
  extractIngredientsFromText,
  normalizeIngredients,
  analyzeIngredients,
  inferIntent,
  researchIngredients,
  generateUI,
} from "@repo/ai-engine";

import { remember, recall } from "@repo/memory";

export const scanRoute = new Hono();

scanRoute.post("/", zValidator("json", ScanRequestSchema), async (c) => {
  const { inputType, value, sessionId, context } = c.req.valid("json");

  /* 1️⃣ INGREDIENT EXTRACTION */
  let rawIngredients: string[] = [];

  if (inputType === "text") {
    rawIngredients = extractIngredientsFromText(value);
  }

  if (inputType === "image") {
    const vision = await visionAgent(value);
    rawIngredients = vision.ingredients ?? [];
  }

  /* 2️⃣ NORMALIZATION */
  const ingredients = Array.from(new Set(normalizeIngredients(rawIngredients)));

  if (!ingredients.length) {
    return c.json(
      { status: "no_ingredients", message: "No ingredients detected." },
      400
    );
  }

  /* 3️⃣ MEMORY READ */
  const memory = sessionId ? await recall(sessionId) : [];

  /* 4️⃣ INTENT */
  const intent = await inferIntent(context, memory);

  /* 5️⃣ ANALYSIS */
  const analysis = analyzeIngredients(ingredients);

  /* 6️⃣ RESEARCH */
  const research = await researchIngredients(analysis);

  /* 7️⃣ UI */
  const ui = await generateUI({
    ingredients,
    analysis,
    research,
    intent,
  });

  /* 8️⃣ MEMORY WRITE */
  if (sessionId) {
    remember(sessionId, {
      ingredients,
      timestamp: new Date().toISOString(),
    });
  }

  return c.json({
    status: "ok",
    ingredients,
    intent,
    analysis,
    ui,
  });
});
