import { Hono } from "hono";
import { serve } from "bun";
import { zValidator } from "@hono/zod-validator";
import { db, schema, saveScanHistory, getRecentPatterns } from "@repo/database";
import { sql } from "drizzle-orm";
import {
  fetchProductByBarcode,
  visionAgent,
  isVisionSuccess,
  isVisionFailure,
  intentInference,
  researchAgent,
  generateUI,
} from "@repo/ai-engine";
import { errorMiddleware } from "./middleware/error";
import { HTTPException } from "hono/http-exception";
import { ScanRequestSchema, parseIngredientList } from "@repo/shared";
import { cors } from "hono/cors";

const { scans } = schema;
const app = new Hono();

/* -------------------- MIDDLEWARE -------------------- */

app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.onError(errorMiddleware);

/* -------------------- ROUTES -------------------- */

app.get("/", (c) => {
  return c.json({ message: "Health Gap Backend is running!" });
});

app.get("/health", async (c) => {
  await db.execute(sql`SELECT 1`);
  return c.json({ status: "healthy", database: "connected" });
});

app.post("/api/scan", zValidator("json", ScanRequestSchema), async (c) => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new HTTPException(408, { message: "Request timeout" })),
      25_000
    );
  });

  const processingPromise = (async () => {
    const { image, barcode, scanLocation, sessionId } = c.req.valid("json");

    let ingredients: string[] = [];
    let productName = "Unknown Product";
    let detectedText = "";

    if (barcode) {
      const product = await fetchProductByBarcode(barcode);
      if (product) {
        ingredients = parseIngredientList(product.ingredients);
        productName = product.productName;
        detectedText = product.ingredients;
      }
    }

    if (!ingredients.length) {
      if (!image) {
        throw new HTTPException(400, { message: "Image required" });
      }

      const visionResult = await visionAgent(image);

      if (isVisionFailure(visionResult)) {
        return c.json({
          status: "vision_failed",
          message: visionResult.message,
          detectedContext: visionResult.detectedContext,
        });
      }

      ingredients = visionResult.ingredients;
      detectedText = JSON.stringify(visionResult);
    }

    const currentTime = new Date().toISOString();
    const recentHistory = sessionId ? await getRecentPatterns(sessionId) : [];

    const intentResult = await intentInference(
      currentTime,
      ingredients,
      productName,
      scanLocation,
      recentHistory
    );

    const researchResult = await researchAgent(
      ingredients,
      intentResult.persona,
      intentResult.riskAssessment,
      intentResult.userContextBias
    );

    const uiResponse = await generateUI(
      researchResult.analysis,
      intentResult.persona,
      {
        consensusStatus: researchResult.consensusStatus,
        tradeOffContexts: researchResult.tradeOffContexts,
      }
    );

    // async persistence (non-blocking)
    (async () => {
      try {
        if (sessionId) {
          await saveScanHistory(sessionId, {
            productName,
            userIntent: intentResult.persona,
            timestamp: currentTime,
          });
        }

        await db.insert(scans).values({
          imageUrl: image ? "image_provided" : "barcode_scan",
          detectedText: detectedText.slice(0, 2000),
          userIntentCategory: intentResult.persona,
          timestamp: new Date(),
        });
      } catch {}
    })();

    return c.json(uiResponse);
  })();

  return await Promise.race([processingPromise, timeoutPromise]);
});

/* -------------------- SERVER START -------------------- */

const port = Number(process.env.PORT) || 3000;

serve({
  fetch: app.fetch,
  port,
});

console.log(`🚀 Backend running on port ${port}`);
