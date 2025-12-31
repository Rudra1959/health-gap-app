import Groq from "groq-sdk";
import { z } from "zod";
import { config } from "./config";
import { withRetry, cleanJson, rateLimitedCall, VisionAnalysisResultSchema, VisionFailureResultSchema, type VisionAgentResult, type VisionAnalysisResult, type VisionFailureResult } from "@repo/shared";

const groq = new Groq({ apiKey: config.GROQ_API_KEY });

function normalizeForComparison(value: string): string {
  return value.replace(/[_\-\s]/g, "").toLowerCase();
}

function findClosestValue<T extends string>(
  rawValue: unknown,
  validValues: readonly T[],
  defaultValue: T
): T {
  if (typeof rawValue !== "string") {
    return defaultValue;
  }

  const normalizedInput = normalizeForComparison(rawValue);

  if (validValues.includes(rawValue as T)) {
    return rawValue as T;
  }

  for (const validValue of validValues) {
    if (normalizeForComparison(validValue) === normalizedInput) {
      return validValue;
    }
  }

  for (const validValue of validValues) {
    const normalizedValid = normalizeForComparison(validValue);
    if (normalizedInput.includes(normalizedValid) || normalizedValid.includes(normalizedInput)) {
      return validValue;
    }
  }

  return defaultValue;
}

const EXTRACTION_QUALITY_VALUES = ["high", "medium", "low"] as const;
const FAILURE_REASON_VALUES = [
  "low_confidence",
  "unreadable_text",
  "no_label_detected",
  "partial_extraction",
  "processing_error",
  "none"
] as const;

const ExtractionQualitySchema = z.enum(["high", "medium", "low"]);
const FailureReasonSchema = z.enum([
  "low_confidence",
  "unreadable_text",
  "no_label_detected",
  "partial_extraction",
  "processing_error",
  "none"
]);

const ExtractionAssessmentSchema = z.object({
  confidence: z.number().min(0).max(1).describe("Overall confidence in extraction accuracy"),
  extractionQuality: z.enum(["high", "medium", "low"]).describe("Quality rating based on holistic assessment"),
  isUsable: z.boolean().describe("Whether the extraction is reliable enough for analysis"),
  failureReason: z.enum([
    "low_confidence",
    "unreadable_text",
    "no_label_detected",
    "partial_extraction",
    "processing_error",
    "none"
  ]).describe("Primary reason if extraction is not usable, or 'none' if successful"),
  reasoning: z.string().describe("Explanation of the assessment"),
});

const RawVisionResponseSchema = z.object({
  ingredients: z.array(z.string()).optional(),
  nutrition: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  isReadable: z.boolean().optional(),
  issues: z.string().nullable().optional(),
  confidence: z.number().optional(),
  productType: z.string().optional(),
  visibleElements: z.array(z.string()).optional(),
  extractionNotes: z.string().optional(),
});

type RawVisionResponse = z.infer<typeof RawVisionResponseSchema>;

const EXTRACTION_ASSESSMENT_SYSTEM_PROMPT = `You are an expert at evaluating the quality and reliability of product label extractions.

## ASSESSMENT RULES

### Confidence Scoring (0-1 scale)
Evaluate holistically based on:
- Completeness of ingredient list (typical products have 5-20 ingredients)
- Presence of nutrition information
- Internal consistency of extracted data
- Absence of garbled or nonsensical text
- Alignment between reported issues and extracted content

Do NOT use fixed thresholds. Consider context:
- A simple product (water, salt) may have few ingredients legitimately
- Complex products should have more ingredients
- Partial but accurate extraction may still be useful

### Extraction Quality Categories
- HIGH: Complete, coherent extraction with high confidence
- MEDIUM: Usable extraction with minor gaps or uncertainties
- LOW: Significant issues but some useful information present

### Usability Determination
The extraction IS usable when:
- Core ingredient list is present and coherent
- Confidence is sufficient for the use case
- No critical data appears corrupted

The extraction is NOT usable when:
- No ingredients detected at all
- Text is clearly unreadable or corrupted
- Confidence is too low to trust any data

### Failure Reason Classification
- unreadable_text: Image quality prevents text recognition
- no_label_detected: No product label visible in image
- partial_extraction: Some data extracted but significant gaps
- low_confidence: Data extracted but reliability is uncertain
- processing_error: Technical failure in processing
- none: Extraction successful

Output ONLY valid JSON matching the required schema.`;

const CONVERSATION_PROMPT_SYSTEM = `You are a helpful assistant guiding users to get better product scans.

## RESPONSE RULES

Generate natural, helpful messages that:
- Acknowledge what was detected (if anything)
- Explain the issue without technical jargon
- Suggest specific actions to improve the scan
- Offer alternative approaches (barcode, manual entry)

Vary your responses based on context. Do NOT use template-like language.

Output JSON with:
- message: A conversational, helpful message to the user
- suggestedQuestions: 3 actionable follow-up options`;

async function assessExtractionWithLLM(
  raw: RawVisionResponse
): Promise<z.infer<typeof ExtractionAssessmentSchema>> {
  const prompt = `Assess this product label extraction:

EXTRACTED DATA:
- Ingredients: ${raw.ingredients?.join(", ") || "None"}
- Ingredient count: ${raw.ingredients?.length || 0}
- Nutrition fields: ${raw.nutrition ? Object.keys(raw.nutrition).length : 0}
- Is readable (self-reported): ${raw.isReadable}
- Reported issues: ${raw.issues || "None"}
- Self-reported confidence: ${raw.confidence || "Not provided"}
- Product type: ${raw.productType || "Unknown"}
- Visible elements: ${raw.visibleElements?.join(", ") || "Unknown"}
- Extraction notes: ${raw.extractionNotes || "None"}

Assess the confidence, quality, usability, and any failure reason.
Return JSON with: confidence, extractionQuality, isUsable, failureReason, reasoning`;

  try {
    const completion = await rateLimitedCall(() => groq.chat.completions.create({
      messages: [
        { role: "system", content: EXTRACTION_ASSESSMENT_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 300,
    }));

    const response = completion.choices[0]?.message?.content;
    if (!response) throw new Error("No response from LLM");

    const parsed = JSON.parse(cleanJson(response));

    // Normalize LLM response to match expected enum values
    const normalizedAssessment = {
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
      extractionQuality: findClosestValue(parsed.extractionQuality, EXTRACTION_QUALITY_VALUES, "medium"),
      isUsable: typeof parsed.isUsable === "boolean" ? parsed.isUsable : true,
      failureReason: findClosestValue(parsed.failureReason, FAILURE_REASON_VALUES, "none"),
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "Assessment completed",
    };

    return ExtractionAssessmentSchema.parse(normalizedAssessment);
  } catch (error) {
    console.warn(`[VisionAgent] LLM assessment failed, using conservative fallback:`, error);
    return {
      confidence: raw.confidence ?? 0.3,
      extractionQuality: "low",
      isUsable: (raw.ingredients?.length ?? 0) >= 2 && raw.isReadable !== false,
      failureReason: raw.isReadable === false ? "unreadable_text" : 
                     (raw.ingredients?.length ?? 0) === 0 ? "no_label_detected" : "low_confidence",
      reasoning: "LLM assessment failed, using conservative defaults based on raw data",
    };
  }
}

async function generateConversationPromptWithLLM(
  raw: RawVisionResponse,
  failureReason: VisionFailureResult["failureReason"]
): Promise<{ message: string; suggestedQuestions: string[] }> {
  const prompt = `Generate a helpful response for a user whose product scan had issues.

CONTEXT:
- Product type: ${raw.productType || "Unknown product"}
- Visible elements: ${raw.visibleElements?.join(", ") || "Unknown"}
- Failure reason: ${failureReason}
- Issues reported: ${raw.issues || "None specified"}
- Partial ingredients found: ${raw.ingredients?.slice(0, 3).join(", ") || "None"}

Create a friendly, helpful message and 3 suggested follow-up actions.
Return JSON with: message, suggestedQuestions (array of 3 strings)`;

  try {
    const completion = await rateLimitedCall(() => groq.chat.completions.create({
      messages: [
        { role: "system", content: CONVERSATION_PROMPT_SYSTEM },
        { role: "user", content: prompt },
      ],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      temperature: 0.6,
      max_tokens: 250,
    }));

    const response = completion.choices[0]?.message?.content;
    if (!response) throw new Error("No response");

    const parsed = JSON.parse(cleanJson(response));
    return {
      message: parsed.message || "I had trouble processing this image. Can you try again?",
      suggestedQuestions: parsed.suggestedQuestions || [
        "Try a different photo",
        "Enter the product manually",
        "Scan the barcode instead"
      ],
    };
  } catch {
    return {
      message: `I couldn't fully process this ${raw.productType || "product"} image. Would you like to try a different approach?`,
      suggestedQuestions: [
        "Take a clearer photo of the label",
        "Scan the barcode instead",
        "Tell me what product this is"
      ],
    };
  }
}

export async function visionAgent(input: Buffer | string): Promise<VisionAgentResult> {
  return withRetry(async () => {
    let imageUrl: string;

    if (Buffer.isBuffer(input)) {
      const base64Image = input.toString("base64");
      imageUrl = `data:image/jpeg;base64,${base64Image}`;
    } else {
      imageUrl = z.string().url().parse(input);
    }

    try {
      const chatCompletion = await rateLimitedCall(() => groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are a vision agent that extracts ingredient information from product label images.

CRITICAL RULES:
1. If text is blurry, unreadable, or cut off, set isReadable to false and describe the issue
2. Do NOT guess or hallucinate ingredients you cannot clearly see
3. Provide a confidence score (0-1) based on image quality and text clarity
4. Identify the product type and visible packaging elements

Return ONLY valid JSON with this structure:
{
  "ingredients": ["ingredient1", "ingredient2", ...],
  "nutrition": { "calories": 100, ... },
  "isReadable": boolean,
  "issues": "description of any problems" | null,
  "confidence": 0.0-1.0,
  "productType": "beverage/snack/dairy/etc",
  "visibleElements": ["bottle", "nutrition label", "barcode", ...],
  "extractionNotes": "any notes about partial/uncertain extractions"
}`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this product image. Extract ingredients and nutrition info. Be conservative - only extract what you can clearly read. If uncertain, lower your confidence score.",
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          },
        ],
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        temperature: 0,
        response_format: { type: "json_object" },
      }));

      const content = chatCompletion.choices[0]?.message?.content;

      if (!content) {
        return createFailureResult({}, "processing_error", 0);
      }

      const raw = RawVisionResponseSchema.parse(JSON.parse(cleanJson(content)));
      let assessment: z.infer<typeof ExtractionAssessmentSchema>;

      const isHighConfidence =
        raw.isReadable !== false &&
        (raw.ingredients?.length ?? 0) >= 3 &&
        (raw.confidence ?? 0) > 0.7;

      if (isHighConfidence) {
        assessment = {
          confidence: raw.confidence || 0.8,
          extractionQuality: "high",
          isUsable: true,
          failureReason: "none",
          reasoning: "High confidence extraction skipped secondary assessment",
        };
      } else {
        assessment = await assessExtractionWithLLM(raw);
      }

      if (!assessment.isUsable || assessment.failureReason !== "none") {
        const failureReason = assessment.failureReason === "none" 
          ? "processing_error" 
          : assessment.failureReason;
        return createFailureResult(raw, failureReason, assessment.confidence);
      }

      const validatedIngredients = raw.ingredients!;

      return VisionAnalysisResultSchema.parse({
        status: "success",
        ingredients: validatedIngredients,
        nutrition: raw.nutrition || {},
        isReadable: true,
        issues: raw.issues || null,
        confidence: assessment.confidence,
        extractionQuality: assessment.extractionQuality,
      });

    } catch (error) {
      return createFailureResult(
        { issues: error instanceof Error ? error.message : "Unknown error" },
        "processing_error",
        0
      );
    }
  });
}

async function createFailureResult(
  raw: RawVisionResponse,
  failureReason: VisionFailureResult["failureReason"],
  confidence: number
): Promise<VisionFailureResult> {
  const { message, suggestedQuestions } = await generateConversationPromptWithLLM(raw, failureReason);
  
  return VisionFailureResultSchema.parse({
    status: "vision_failed",
    ui_action: "prompt_user_input",
    message,
    detectedContext: {
      productType: raw.productType,
      visibleElements: raw.visibleElements,
      suggestedQuestions,
    },
    failureReason,
    confidence,
  });
}

export function isVisionSuccess(result: VisionAgentResult): result is VisionAnalysisResult {
  return result.status === "success";
}

export function isVisionFailure(result: VisionAgentResult): result is VisionFailureResult {
  return result.status === "vision_failed";
}
