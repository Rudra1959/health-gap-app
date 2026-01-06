import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db, schema, saveScanHistory, getRecentPatterns } from "@repo/database";
import { sql } from "drizzle-orm";
import { fetchProductByBarcode, visionAgent, isVisionSuccess, isVisionFailure, intentInference, researchAgent, generateUI } from "@repo/ai-engine";
import { errorMiddleware } from "./middleware/error";
import { HTTPException } from "hono/http-exception";
import { ScanRequestSchema, parseIngredientList } from "@repo/shared";
import { config } from "./config";
import { cors } from "hono/cors";

const { scans } = schema;

const app = new Hono();
app.use(
  "/*",
  cors({
    origin: "*", // In production, change this to your frontend URL
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.onError(errorMiddleware);

app.get("/", (c) => {
  return c.json({ message: "Health Gap Backend is running!" });
});

app.get("/health", async (c) => {
  await db.execute(sql`SELECT 1`);
  return c.json({ status: "healthy", database: "connected" });
});

const routes = app.post(
  "/api/scan",
  zValidator("json", ScanRequestSchema),
  async (c) => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new HTTPException(408, { message: "Request timeout" })),
        config.GLOBAL_TIMEOUT_MS
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

      if (ingredients.length === 0) {
        if (!image) {
          throw new HTTPException(400, { message: "Image required when barcode lookup fails" });
        }
        
        const visionResult = await visionAgent(image);
        
        if (isVisionFailure(visionResult)) {
          return c.json({
            status: "vision_failed",
            ui_action: "prompt_user_input",
            message: visionResult.message,
            detectedContext: visionResult.detectedContext,
            failureReason: visionResult.failureReason,
            confidence: visionResult.confidence,
            components: [{
              component: "ConversationPrompt",
              variant: "card",
              priority: 1,
              props: {
                message: visionResult.message,
                suggestedQuestions: visionResult.detectedContext.suggestedQuestions,
                productType: visionResult.detectedContext.productType,
                severity: "info",
              },
              metadata: {
                intent: "Conversation Mode",
                confidence: visionResult.confidence,
                sources: [],
              },
            }],
            schema: {
              generatedComponents: [{
                name: "ConversationPrompt",
                description: "Prompts user for additional input when vision fails",
                requiredProps: [
                  { name: "message", type: "text", description: "Main message to display" },
                  { name: "suggestedQuestions", type: "list", description: "Questions to help user" },
                  { name: "productType", type: "text", description: "Detected product type" },
                  { name: "severity", type: "severity", description: "Info level" },
                ],
              }],
            },
          });
        }
        
        if (isVisionSuccess(visionResult)) {
          ingredients = visionResult.ingredients;
          detectedText = JSON.stringify(visionResult);
        }
      }

      const currentTime = new Date().toISOString();
      const recentHistory = sessionId ? await getRecentPatterns(sessionId) : [];
      
      const intentResult = await intentInference(currentTime, ingredients, productName, scanLocation, recentHistory);
      const userIntent = intentResult.persona;
      const userContextBias = intentResult.userContextBias;
      
      const researchResult = await researchAgent(ingredients, userIntent, intentResult.riskAssessment, userContextBias);
      
      const uiResponse = await generateUI(
        researchResult.analysis, 
        userIntent,
        {
          consensusStatus: researchResult.consensusStatus,
          tradeOffContexts: researchResult.tradeOffContexts,
        }
      );

      let healthScore: number | null = null;
      for (const comp of uiResponse.components) {
        const props = comp.props as Record<string, unknown>;
        const scoreProps = ["score", "healthScore", "safetyScore", "overallScore", "rating"];
        
        for (const prop of scoreProps) {
          if (typeof props[prop] === "number") {
            healthScore = props[prop] as number;
            break;
          }
        }
        if (healthScore !== null) break;
      }

      (async () => {
        const persistencePromises: Promise<unknown>[] = [];
        
        if (sessionId) {
          persistencePromises.push(
            saveScanHistory(sessionId, {
              productName,
              userIntent,
              healthScore,
              timestamp: currentTime,
            }).catch(() => {})
          );
        }
        
        persistencePromises.push(
          db.insert(scans).values({
            imageUrl: image ? "image_provided" : "barcode_scan",
            detectedText: detectedText.substring(0, 2000),
            healthScore: healthScore,
            userIntentCategory: userIntent,
            timestamp: new Date(),
          }).catch(() => {})
        );
        
        await Promise.allSettled(persistencePromises);
      })();

      return c.json(uiResponse);
    })();
    
    return await Promise.race([processingPromise, timeoutPromise]);
  }
);

export type AppType = typeof routes;
export default app;
