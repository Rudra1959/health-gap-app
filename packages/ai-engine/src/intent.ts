import Groq from "groq-sdk";
import { z } from "zod";
import { config } from "./config";
import { withRetry, cleanJson, rateLimitedCall, IntentInferenceResultSchema, type IntentInferenceResult } from "@repo/shared";

const groq = new Groq({ apiKey: config.GROQ_API_KEY });

const ScanHistoryEntrySchema = z.object({
  productName: z.string(),
  userIntent: z.string().optional(),
  healthScore: z.number().nullable().optional(),
  timestamp: z.string(),
});

export type ScanHistoryEntry = z.infer<typeof ScanHistoryEntrySchema>;

function extractHistoryPatterns(history: ScanHistoryEntry[]): {
  recentProducts: string[];
  recentIntents: string[];
  dominantCategory: string | null;
} {
  const recentProducts = history
    .slice(0, 5)
    .map(h => h.productName)
    .filter(Boolean);
  
  const recentIntents = history
    .slice(0, 5)
    .map(h => h.userIntent)
    .filter((intent): intent is string => Boolean(intent));
  
  const intentCounts = recentIntents.reduce((acc, intent) => {
    acc[intent] = (acc[intent] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const dominantCategory = Object.entries(intentCounts)
    .sort((a, b) => b[1] - a[1])
    .filter(([_, count]) => count >= 2)
    .map(([intent]) => intent)[0] || null;
  
  return { recentProducts, recentIntents, dominantCategory };
}

export async function intentInference(
  currentTime: string,
  ingredients: string[],
  detectedProductType: string,
  scanLocation?: string,
  recentScanHistory: ScanHistoryEntry[] = []
): Promise<IntentInferenceResult> {
  return withRetry(async () => {
    const validatedHistory = z.array(ScanHistoryEntrySchema).parse(recentScanHistory);
    const { recentProducts, recentIntents, dominantCategory } = extractHistoryPatterns(validatedHistory);
    const hasHistory = recentProducts.length > 0;
    
    const historyContext = hasHistory
      ? `
      USER SESSION HISTORY (most recent first):
      - Recent Products: ${recentProducts.join(", ")}
      - Recent Intents: ${recentIntents.join(", ") || "None classified yet"}
      - Dominant Pattern: ${dominantCategory || "No clear pattern yet"}
      `
      : "No session history available (first scan).";

    const prompt = `
Analyze the current product in the context of the user's recent scan history.

CURRENT SCAN:
- Time: ${currentTime}
- Product: ${detectedProductType}
- Ingredients: ${ingredients.slice(0, 50).join(", ")}
- Location: ${scanLocation || "Unknown"}

${historyContext}

CONTEXT-AWARE INFERENCE RULES:
1. If history shows fitness products (Creatine, Whey, Pre-workout) and current item is carbs/bread:
   → Intent: "Carb Loading/Bulking" (not "Unhealthy Carbs")
   
2. If history shows baby products and current item is any food:
   → Intent: "Pediatric Safety" (parent shopping for child)
   
3. If history shows diet/low-calorie products and current item is indulgent:
   → Intent: "Cheat Meal/Moderation" (not "Unhealthy")
   
4. If history shows organic/clean products consistently:
   → Intent: "Clean Label/Organic" bias
   
5. If history shows allergy-related products (gluten-free, dairy-free):
   → Intent: "Allergy Management" (heightened ingredient scrutiny)

6. If no history or no pattern: Use standard product-based inference.

RESPOND WITH JSON:
{
  "persona": "Short Persona Name (max 3 words)",
  "userContextBias": "A sentence describing how to bias the nutritional analysis based on this user's apparent goals. Be specific.",
  "confidence": "high|medium|low",
  "reasoning": "Brief explanation of inference logic",
  "riskAssessment": {
    "ingredientsToResearch": ["ingredient1", "ingredient2"],
    "riskDetails": {
      "ingredient1": {
        "riskLevel": "HIGH_SCRUTINY|MODERATE_SCRUTINY|STANDARD_REVIEW|GENERALLY_RECOGNIZED_SAFE",
        "reasoning": "Why this risk level",
        "requiresDeepResearch": boolean
      }
    }
  }
}



DATA INTEGRITY RULES:
1. Multilingual Handling: Resolve the nutritional concept of non-English ingredients internally.
2. Output Key Stability: The keys in 'riskDetails' MUST be identical to the strings in the 'ingredients' input list.
   - Do NOT translate keys in the JSON output.
   - Do NOT normalize casing or punctuation in the keys.
   - The map must be directly visibly consistent with the input array.
`;

    const chatCompletion = await rateLimitedCall(() => groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are an expert at inferring user health intent by analyzing patterns in their scanning behavior. Your job is to understand the USER'S GOALS, not just categorize products. Output valid JSON only.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 200,
    }));

    const content = chatCompletion.choices[0]?.message?.content;
    
    if (!content) {
      return IntentInferenceResultSchema.parse({
        persona: "General Health",
        userContextBias: "No specific user context available. Provide balanced nutritional analysis.",
        confidence: "low",
        historyInfluenced: false,
      });
    }
    
    try {
      const parsed = JSON.parse(cleanJson(content));
      
      return IntentInferenceResultSchema.parse({
        persona: parsed.persona || "General Health",
        userContextBias: parsed.userContextBias || "Provide balanced nutritional analysis.",
        confidence: parsed.confidence || "medium",
        historyInfluenced: hasHistory && parsed.confidence !== "low",
        riskAssessment: parsed.riskAssessment,
      });
    } catch {
      return IntentInferenceResultSchema.parse({
        persona: content.trim().substring(0, 30) || "General Health",
        userContextBias: "Provide balanced nutritional analysis.",
        confidence: "low",
        historyInfluenced: false,
      });
    }
  });
}
