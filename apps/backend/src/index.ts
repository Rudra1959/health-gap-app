import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { sql } from "drizzle-orm";

import { db, schema, saveScanHistory, getRecentPatterns } from "@repo/database";

import {
  fetchProductByBarcode,
  visionAgent,
  isVisionFailure,
  intentInference,
  researchAgent,
  generateUI,
} from "@repo/ai-engine";

import { ScanRequestSchema, parseIngredientList } from "@repo/shared";
import { errorMiddleware } from "./middleware/error";

const { scans } = schema;
const app = new Hono();

/* =======================
   Middleware
======================= */

app.use(
  "/*",
  cors({
    origin: "*", // 🔒 lock this to frontend domain in prod
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.onError(errorMiddleware);

/* =======================
   Routes
======================= */

// Fast root response (Railway health / proxy)
app.get("/", (c) => c.text("OK"));
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
app.get("/health/db", async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({ database: "connected" });
  } catch (err) {
    return c.json({ database: "error", message: String(err) }, 500);
  }
});


app.post("/api/scan", zValidator("json", ScanRequestSchema), async (c) => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new HTTPException(408, { message: "Request timeout" })),
      25_000
    )
  );

  const job = (async () => {
    const { image, barcode, scanLocation, sessionId } = c.req.valid("json");

    let ingredients: string[] = [];
    let productName = "Unknown Product";
    let detectedText = "";

    /* ---------- Barcode lookup ---------- */
    if (barcode) {
      const product = await fetchProductByBarcode(barcode);
      if (product) {
        ingredients = parseIngredientList(product.ingredients);
        productName = product.productName;
        detectedText = product.ingredients;
      }
    }

    /* ---------- Vision fallback ---------- */
    if (!ingredients.length) {
      if (!image) {
        throw new HTTPException(400, {
          message: "Image required when barcode fails",
        });
      }

      const vision = await visionAgent(image);

      if (isVisionFailure(vision)) {
        return c.json({
          status: "vision_failed",
          message: vision.message,
          confidence: vision.confidence,
        });
      }

      ingredients = vision.ingredients;
      detectedText = JSON.stringify(vision);
    }

    /* ---------- AI reasoning ---------- */
    const now = new Date().toISOString();
    const history = sessionId ? await getRecentPatterns(sessionId) : [];

    const intent = await intentInference(
      now,
      ingredients,
      productName,
      scanLocation,
      history
    );

    const research = await researchAgent(
      ingredients,
      intent.persona,
      intent.riskAssessment,
      intent.userContextBias
    );

    const ui = await generateUI(research.analysis, intent.persona, {
      consensusStatus: research.consensusStatus,
      tradeOffContexts: research.tradeOffContexts,
    });

    /* ---------- Async persistence (non-blocking) ---------- */
    Promise.allSettled([
      sessionId &&
        saveScanHistory(sessionId, {
          productName,
          userIntent: intent.persona,
          timestamp: now,
        }),
      db.insert(scans).values({
        imageUrl: image ? "image" : "barcode",
        detectedText: detectedText.slice(0, 2000),
        userIntentCategory: intent.persona,
        timestamp: new Date(),
      }),
    ]);

    return c.json(ui);
  })();

  return Promise.race([job, timeout]);
});

/* =======================
   ✅ Bun Auto-Server (IMPORTANT)
   DO NOT call Bun.serve()
======================= */

export default {
  port: Number(process.env.PORT), // Railway injects this
  fetch: app.fetch,
};
