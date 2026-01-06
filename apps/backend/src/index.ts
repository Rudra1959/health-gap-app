import { Hono } from "hono";
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

/* ---------- middleware ---------- */
app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.onError(errorMiddleware);

/* ---------- routes ---------- */
app.get("/", (c) => c.json({ message: "Health Gap Backend is running!" }));

app.get("/health", async (c) => {
  await db.execute(sql`SELECT 1`);
  return c.json({ status: "healthy", database: "connected" });
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

      const vision = await visionAgent(image);

      if (isVisionFailure(vision)) {
        return c.json({ status: "vision_failed", message: vision.message });
      }

      ingredients = vision.ingredients;
      detectedText = JSON.stringify(vision);
    }

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

    // async persistence
    (async () => {
      try {
        if (sessionId) {
          await saveScanHistory(sessionId, {
            productName,
            userIntent: intent.persona,
            timestamp: now,
          });
        }

        await db.insert(scans).values({
          imageUrl: image ? "image" : "barcode",
          detectedText: detectedText.slice(0, 2000),
          userIntentCategory: intent.persona,
          timestamp: new Date(),
        });
      } catch {}
    })();

    return c.json(ui);
  })();

  return await Promise.race([job, timeout]);
});

/* ---------- Bun server ---------- */
const port = Number(process.env.PORT);
if (!port) {
  throw new Error("PORT is not defined");
}
if(!(globalThis as any).__bunServer) {
  (globalThis as any).__bunServer = Bun.serve({
    port,
    fetch: app.fetch,
  });
console.log(`🚀 Backend running on port ${port}`);}
export default app;