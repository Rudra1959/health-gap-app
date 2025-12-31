import { z } from "zod";

export const SourceCredibilityCategorySchema = z.enum([
  "REGULATORY_AUTHORITY",
  "PEER_REVIEWED_RESEARCH",
  "INSTITUTIONAL_RESEARCH",
  "INDUSTRY_PUBLICATION",
  "NEWS_MEDIA",
  "GENERAL_WEB",
]);

export const SafetyStanceSchema = z.enum([
  "APPROVED",
  "CONDITIONALLY_SAFE",
  "UNDER_REVIEW",
  "CAUTION_ADVISED",
  "RESTRICTED",
  "PROHIBITED",
]);

export const IngredientRiskLevelSchema = z.enum([
  "HIGH_SCRUTINY",
  "MODERATE_SCRUTINY",
  "STANDARD_REVIEW",
  "GENERALLY_RECOGNIZED_SAFE",
]);

export const RegionSchema = z.enum([
  "UNITED_STATES",
  "EUROPEAN_UNION",
  "UNITED_KINGDOM",
  "CANADA",
  "AUSTRALIA_NZ",
  "JAPAN",
  "CHINA",
  "GLOBAL_WHO",
  "OTHER",
  "UNSPECIFIED",
]);

export const ConflictTypeSchema = z.enum([
  "REGIONAL",
  "SCIENTIFIC",
  "DOSAGE",
  "POPULATION",
  "TEMPORAL",
  "METHODOLOGICAL",
]);

export const ExtractionConfidenceSchema = z.object({
  score: z.number().min(0).max(1),
  qualityAssessment: z.enum(["high", "medium", "low"]),
  reasoning: z.string(),
});

export const ScanRequestSchema = z.object({
  image: z.string().optional(),
  barcode: z.string().optional(),
  scanLocation: z.string().optional(),
  sessionId: z.string().optional(),
}).refine((data) => data.image || data.barcode, {
  message: "Either image or barcode is required",
  path: ["image"],
});

export const VisionAnalysisResultSchema = z.object({
  status: z.literal("success"),
  ingredients: z.array(z.string()),
  nutrition: z.record(z.string(), z.union([z.string(), z.number()])),
  isReadable: z.boolean(),
  issues: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  extractionQuality: z.enum(["high", "medium", "low"]),
});

export const VisionFailureResultSchema = z.object({
  status: z.literal("vision_failed"),
  ui_action: z.literal("prompt_user_input"),
  message: z.string(),
  detectedContext: z.object({
    productType: z.string().optional(),
    visibleElements: z.array(z.string()).optional(),
    suggestedQuestions: z.array(z.string()).optional(),
  }),
  failureReason: z.enum([
    "low_confidence",
    "unreadable_text",
    "no_label_detected",
    "partial_extraction",
    "processing_error",
  ]),
  confidence: z.number().min(0).max(1),
});

export const VisionAgentResultSchema = z.union([
  VisionAnalysisResultSchema,
  VisionFailureResultSchema,
]);

export const IntentInferenceResultSchema = z.object({
  persona: z.string(),
  userContextBias: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  historyInfluenced: z.boolean(),
  riskAssessment: z.object({
    ingredientsToResearch: z.array(z.string()),
    riskDetails: z.record(z.string(), z.object({
      riskLevel: IngredientRiskLevelSchema,
      reasoning: z.string(),
      requiresDeepResearch: z.boolean(),
    })),
  }).optional(),
});

export const ConsensusStatusSchema = z.enum([
  "CLEAR_CONSENSUS",
  "CONFLICTING_EVIDENCE",
  "INSUFFICIENT_DATA",
]);

export const TradeOffContextSchema = z.object({
  ingredient: z.string(),
  conflictType: ConflictTypeSchema,
  summary: z.string(),
  positions: z.array(z.object({
    source: z.string(),
    sourceCredibility: SourceCredibilityCategorySchema,
    region: RegionSchema,
    stance: SafetyStanceSchema,
    rationale: z.string(),
  })),
  userGuidance: z.string(),
});

export const SourceClaimSchema = z.object({
  source: z.string(),
  sourceUrl: z.string().url().optional(),
  sourceCredibility: SourceCredibilityCategorySchema,
  claim: z.string(),
  stance: SafetyStanceSchema,
  region: RegionSchema,
  datePublished: z.string().optional(),
  confidenceInClassification: z.number().min(0).max(1),
});

export const IngredientResearchSchema = z.object({
  ingredient: z.string(),
  riskLevel: IngredientRiskLevelSchema,
  claims: z.array(SourceClaimSchema),
  conflictDetected: z.boolean(),
  conflictType: ConflictTypeSchema.optional(),
  conflictSummary: z.string().optional(),
  confidenceScore: z.number().min(0).max(1),
  ambiguityLevel: z.enum(["low", "medium", "high"]),
  riskAssessmentReasoning: z.string(),
});

export const ResearchAgentResultSchema = z.object({
  analysis: z.string(),
  consensusStatus: ConsensusStatusSchema,
  tradeOffContexts: z.array(TradeOffContextSchema),
  metadata: z.object({
    sourcesConsulted: z.number(),
    overallConfidence: z.number(),
    unresolvedConflicts: z.number(),
    dataWarnings: z.number(),
  }),
});

export const CombinedResearchResultSchema = z.object({
  claims: z.record(z.string(), SourceClaimSchema),
  conflict: z.object({
    detected: z.boolean(),
    type: ConflictTypeSchema.optional(),
    confidence: z.number().min(0).max(1),
    summary: z.string().optional(),
  }),
});

export const UIPropTypeSchema = z.enum([
  "text",
  "number",
  "boolean",
  "severity",
  "color",
  "icon",
  "list",
  "keyValue",
  "percentage",
  "url",
  "date",
]);

export const DynamicComponentSchema = z.object({
  component: z.string(),
  variant: z.enum(["card", "banner", "badge", "meter", "list", "comparison", "timeline"]),
  priority: z.number().min(1).max(10),
  props: z.record(z.string(), z.unknown()),
  metadata: z.object({
    intent: z.string(),
    confidence: z.number().min(0).max(1),
    sources: z.array(z.string()).optional(),
  }),
});

export const DynamicUIResponseSchema = z.object({
  schema: z.object({
    generatedComponents: z.array(z.object({
      name: z.string(),
      description: z.string(),
      requiredProps: z.array(z.object({
        name: z.string(),
        type: UIPropTypeSchema,
        description: z.string(),
      })),
    })),
  }),
  components: z.array(DynamicComponentSchema),
  layoutHints: z.object({
    primaryComponent: z.string().optional(),
    grouping: z.array(z.array(z.string())).optional(),
  }).optional(),
});

export type ScanRequest = z.infer<typeof ScanRequestSchema>;
export type VisionAnalysisResult = z.infer<typeof VisionAnalysisResultSchema>;
export type VisionFailureResult = z.infer<typeof VisionFailureResultSchema>;
export type VisionAgentResult = z.infer<typeof VisionAgentResultSchema>;
export type IntentInferenceResult = z.infer<typeof IntentInferenceResultSchema>;
export type ConsensusStatus = z.infer<typeof ConsensusStatusSchema>;
export type TradeOffContext = z.infer<typeof TradeOffContextSchema>;
export type ResearchAgentResult = z.infer<typeof ResearchAgentResultSchema>;
export type DynamicComponent = z.infer<typeof DynamicComponentSchema>;
export type DynamicUIResponse = z.infer<typeof DynamicUIResponseSchema>;
export type SourceCredibilityCategory = z.infer<typeof SourceCredibilityCategorySchema>;
export type SafetyStance = z.infer<typeof SafetyStanceSchema>;
export type IngredientRiskLevel = z.infer<typeof IngredientRiskLevelSchema>;
export type Region = z.infer<typeof RegionSchema>;
export type ConflictType = z.infer<typeof ConflictTypeSchema>;
export type SourceClaim = z.infer<typeof SourceClaimSchema>;
export type IngredientResearch = z.infer<typeof IngredientResearchSchema>;
export type UIPropType = z.infer<typeof UIPropTypeSchema>;
export type CombinedResearchResult = z.infer<typeof CombinedResearchResultSchema>;
