import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "./db";
import { scans } from "./db/schema";
import { sql } from "drizzle-orm";
import { fetchProductByBarcode } from "./lib/openFoodFacts";
import { visionAgent, isVisionSuccess, isVisionFailure } from "./lib/visionAgent";
import { intentInference } from "./lib/intentInference";
import { researchAgent } from "./lib/researchAgent";
import { generateUI } from "./lib/generativeUI";
import { saveScanHistory, getRecentPatterns } from "./lib/redisClient";
import { errorMiddleware } from "./middleware/error";
import { HTTPException } from "hono/http-exception";
import { parseIngredientList } from "./utils/ingredients";

const app = new Hono();

app.onError(errorMiddleware);

app.get("/", (c) => {
  return c.json({ message: "Health Gap Backend is running!" });
});

app.get("/health", async (c) => {
  await db.execute(sql`SELECT 1`);
  return c.json({ status: "healthy", database: "connected" });
});

const scanSchema = z.object({
  image: z.string().optional(),
  barcode: z.string().optional(),
  scanLocation: z.string().optional(),
  sessionId: z.string().optional(),
}).refine((data) => data.image || data.barcode, {
  message: "Either image or barcode is required",
  path: ["image"],
});

const routes = app.post(
  "/api/scan",
  zValidator("json", scanSchema),
  async (c) => {
    // Global timeout wrapper to prevent hanging requests
    const GLOBAL_TIMEOUT = 55000; // 55 seconds (under test timeout of 60s)
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Request timeout - pipeline took too long")), GLOBAL_TIMEOUT);
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
        
        // =========================================================================
        // GRACEFUL FAILURE: Short-circuit to conversation mode when vision fails
        // =========================================================================
        // Instead of throwing errors, we return a conversational response that
        // prompts the user for more information. This acts as a "co-pilot" rather
        // than just failing silently or with cryptic errors.
        // =========================================================================
        
        if (isVisionFailure(visionResult)) {
          console.log(`[Pipeline] Vision failed gracefully: ${visionResult.failureReason}`);
          
          // Return conversation mode response directly
          return c.json({
            status: "vision_failed",
            ui_action: "prompt_user_input",
            message: visionResult.message,
            detectedContext: visionResult.detectedContext,
            failureReason: visionResult.failureReason,
            confidence: visionResult.confidence,
            // Include minimal UI for the frontend to render conversation mode
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
        
        // Vision succeeded - extract data
        if (isVisionSuccess(visionResult)) {
          ingredients = visionResult.ingredients;
          detectedText = JSON.stringify(visionResult);
          console.log(`[Pipeline] Vision succeeded with ${ingredients.length} ingredients (confidence: ${visionResult.confidence})`);
        }
      }

      // =========================================================================
      // PIPELINE OPTIMIZATION: Parallel execution where dependencies allow
      // =========================================================================
      // Dependency graph:
      //   intentInference(time, product, location, history) -> {persona, contextBias}
      //   researchAgent(ingredients, userIntent, contextBias) -> analysis
      //   generateUI(analysis, userIntent) -> uiResponse
      //
      // Optimization: intentInference is fast (~200 tokens output), so we run it
      // first, then chain researchAgent -> generateUI. Rate limits prevent true
      // parallelism of LLM calls, but we minimize sequential waiting.
      // =========================================================================

      const currentTime = new Date().toISOString();
      
      // Fetch recent scan history for stateful intent inference
      const recentHistory = sessionId ? await getRecentPatterns(sessionId) : [];
      
      // Phase 1: Stateful intent inference (considers session history)
      const intentResult = await intentInference(currentTime, productName, scanLocation, recentHistory);
      const userIntent = intentResult.persona;
      const userContextBias = intentResult.userContextBias;
      
      console.log(`[Pipeline] Intent: ${userIntent} (confidence: ${intentResult.confidence}, history-influenced: ${intentResult.historyInfluenced})`);
      console.log(`[Pipeline] Context Bias: ${userContextBias}`);
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Phase 2: Research + UI generation (sequential due to data dependency)
      // Pass userContextBias to research agent for personalized analysis
      const researchResult = await researchAgent(ingredients, userIntent, userContextBias);
      
      console.log(`[Pipeline] Research Consensus: ${researchResult.consensusStatus}, Trade-offs: ${researchResult.tradeOffContexts.length}`);
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Pass research result with conflict context to UI generator
      const uiResponse = await generateUI(
        researchResult.analysis, 
        userIntent,
        {
          consensusStatus: researchResult.consensusStatus,
          tradeOffContexts: researchResult.tradeOffContexts,
        }
      );

      // =========================================================================
      // ASYNC PERSISTENCE: Fire-and-forget with parallel writes
      // =========================================================================
      // Extract health score synchronously (fast), then persist in background
      // =========================================================================
      
      // Extract health score before async block to avoid closure issues
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

      // Fire-and-forget async persistence with parallel writes
      (async () => {
        const persistencePromises: Promise<unknown>[] = [];
        
        // Redis write (if session exists)
        if (sessionId) {
          persistencePromises.push(
            saveScanHistory(sessionId, {
              productName,
              userIntent,
              healthScore,
              timestamp: currentTime,
            }).catch((err) => {
              console.error("[Persistence] Redis saveScanHistory failed:", err instanceof Error ? err.message : err);
            })
          );
        }
        
        // Postgres write
        persistencePromises.push(
          db.insert(scans).values({
            imageUrl: image ? "image_provided" : "barcode_scan",
            detectedText: detectedText.substring(0, 2000),
            healthScore: healthScore,
            userIntentCategory: userIntent,
            timestamp: new Date(),
          }).catch((err) => {
            console.error("[Persistence] Postgres insert failed:", err instanceof Error ? err.message : err);
          })
        );
        
        // Execute all persistence operations in parallel
        await Promise.allSettled(persistencePromises);
      })();

      return c.json(uiResponse);
    })();
    
    // Race between processing and timeout
    try {
      return await Promise.race([processingPromise, timeoutPromise]);
    } catch (error) {
      if (error instanceof Error && error.message.includes("timeout")) {
        console.error("[Pipeline] Request timed out");
        throw new HTTPException(408, { message: "Request timeout - please try again" });
      }
      throw error;
    }
  }
);

export type AppType = typeof routes;
export default app;
