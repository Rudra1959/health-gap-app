import Groq from "groq-sdk";
import Exa from "exa-js";
import { z } from "zod";
import { config } from "./config";
import { 
  withRetry, 
  cleanJson,
  rateLimitedCall,
  SourceClaimSchema,
  IngredientResearchSchema,
  SafetyStanceSchema,
  SourceCredibilityCategorySchema,
  RegionSchema,
  ConflictTypeSchema,
  IngredientRiskLevelSchema,
  CombinedResearchResultSchema,
  type SourceClaim,
  type IngredientResearch,
  type SafetyStance,
  type SourceCredibilityCategory,
  type Region,
  type ConflictType,
  type IngredientRiskLevel,
  type CombinedResearchResult,
  type IntentInferenceResult,
} from "@repo/shared";

const groq = new Groq({ apiKey: config.GROQ_API_KEY });
const exa = new Exa(config.EXA_API_KEY || "");

function findClosestEnumValue<T extends string>(value: unknown, validValues: readonly T[], defaultValue: T): T {
  if (typeof value !== "string") return defaultValue;
  
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  
  for (const valid of validValues) {
    if (valid.toUpperCase().replace(/[^A-Z0-9]/g, "") === normalized) return valid;
  }
  
  for (const valid of validValues) {
    const validNorm = valid.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (validNorm.includes(normalized) || normalized.includes(validNorm)) return valid;
  }
  
  return defaultValue;
}

function coerceToNumber(value: unknown, defaultVal: number, min = 0, max = 1): number {
  if (typeof value === "number" && !isNaN(value)) return Math.max(min, Math.min(max, value));
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) return Math.max(min, Math.min(max, parsed));
  }
  return defaultVal;
}

function coerceToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.filter(v => typeof v === "string").join("; ");
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const extracted = obj.text ?? obj.message ?? obj.content ?? obj.value ?? obj.reasoning;
    if (typeof extracted === "string") return extracted;
    return JSON.stringify(value);
  }
  return String(value);
}

function coerceToBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true" || value === "1";
  return Boolean(value);
}

const REGION_VALUES = [
  "UNITED_STATES", "EUROPEAN_UNION", "UNITED_KINGDOM", "CANADA", 
  "AUSTRALIA_NZ", "JAPAN", "CHINA", "GLOBAL_WHO", "OTHER", "UNSPECIFIED"
] as const;

const CREDIBILITY_VALUES = [
  "REGULATORY_AUTHORITY", "PEER_REVIEWED_RESEARCH", "INSTITUTIONAL_RESEARCH",
  "INDUSTRY_PUBLICATION", "NEWS_MEDIA", "GENERAL_WEB"
] as const;

const STANCE_VALUES = [
  "APPROVED", "CONDITIONALLY_SAFE", "UNDER_REVIEW", 
  "CAUTION_ADVISED", "RESTRICTED", "PROHIBITED"
] as const;

const CONFLICT_TYPE_VALUES = [
  "REGIONAL", "SCIENTIFIC", "DOSAGE", "POPULATION", "TEMPORAL", "METHODOLOGICAL"
] as const;

const RISK_LEVEL_VALUES = [
  "HIGH_SCRUTINY", "MODERATE_SCRUTINY", "STANDARD_REVIEW", "GENERALLY_RECOGNIZED_SAFE"
] as const;



const IngredientRiskAssessmentSchema = z.object({
  riskLevel: IngredientRiskLevelSchema,
  reasoning: z.string(),
  requiresDeepResearch: z.boolean(),
});



export type ConsensusStatus = 
  | "CLEAR_CONSENSUS"
  | "CONFLICTING_EVIDENCE"
  | "INSUFFICIENT_DATA";

export interface TradeOffContext {
  ingredient: string;
  conflictType: ConflictType;
  summary: string;
  positions: {
    source: string;
    sourceCredibility: SourceCredibilityCategory;
    region: Region;
    stance: SafetyStance;
    rationale: string;
  }[];
  userGuidance: string;
}

export interface ResearchAgentResult {
  analysis: string;
  consensusStatus: ConsensusStatus;
  tradeOffContexts: TradeOffContext[];
  metadata: {
    sourcesConsulted: number;
    overallConfidence: number;
    unresolvedConflicts: number;
    dataWarnings: number;
  };
}

interface GroundedResearchResult {
  ingredientResearch: IngredientResearch[];
  overallConfidence: number;
  unresolvedConflicts: string[];
  dataQualityWarnings: string[];
}

const COMBINED_RESEARCH_SYSTEM_PROMPT = `You are an expert at analyzing health and regulatory information sources and detecting conflicts.

## TASK
1. Analyze each source individually to extract credibility, stance, region, and confidence.
2. Analyze the set of sources globally to detect conflicts.

## CLASSIFICATION RULES

### Source Credibility
- REGULATORY_AUTHORITY: Government bodies (FDA, EFSA)
- PEER_REVIEWED_RESEARCH: Academic journals
- INSTITUTIONAL_RESEARCH: Universities, reputable institutes
- INDUSTRY_PUBLICATION: Trade/Industry funded
- NEWS_MEDIA: Journalism
- GENERAL_WEB: Blogs, unverified

### Safety Stance
Analyze SEMANTIC MEANING:
- APPROVED: Safe, cleared
- CONDITIONALLY_SAFE: Safe with limits/conditions
- UNDER_REVIEW: Pending
- CAUTION_ADVISED: Risks identified
- RESTRICTED: Limited use
- PROHIBITED: Banned

### Conflict Detection (Global)
A TRUE conflict mentions:
- REGIONAL: Different standards (e.g., banned in EU, allowed in US)
- SCIENTIFIC: Contradictory study results
- DOSAGE/POPULATION: Disagreements on limits or at-risk groups

Do NOT flag apparent conflicts (e.g. low vs high credibility sources disagreeing).

Output STRICT JSON matching the required schema.`;







function getResearchDepth(ingredientCount: number, hasHighRisk: boolean): {
  maxIngredients: number;
  resultsPerIngredient: number;
} {
  if (ingredientCount <= 2) {
    return { maxIngredients: 2, resultsPerIngredient: hasHighRisk ? 4 : 3 };
  } else if (ingredientCount <= 4) {
    return { maxIngredients: 3, resultsPerIngredient: 3 };
  } else {
    // Cap ingredients but ensure we get enough data for the ones we do check
    return { maxIngredients: 3, resultsPerIngredient: 2 };
  }
}

function buildSearchQueries(ingredient: string, userIntent: string): string[] {
  const baseQueries = [
    `"${ingredient}" FDA safety assessment OR EFSA opinion OR WHO evaluation`,
    `"${ingredient}" banned OR restricted OR prohibited food additive`,
    `"${ingredient}" health effects systematic review OR meta-analysis`,
  ];
  
  const intentQuery = `"${ingredient}" ${userIntent} health implications`;
   
  return [intentQuery, ...baseQueries];
}

async function analyzeResearchWithLLM(
  results: any[],
  ingredient: string
): Promise<CombinedResearchResult> {
  if (results.length === 0) {
    return {
      claims: {},
      conflict: { detected: false, confidence: 0.0 }
    };
  }

  const claimsData = results.map((result, idx) => ({
    idx,
    content: result.summary || result.highlights?.join(" ") || result.text || "",
    title: result.title || "",
    url: result.url || "",
    publishedDate: result.publishedDate,
  }));

  const prompt = `Analyze these search results for "${ingredient}":

${claimsData.map(c => `[SOURCE ${c.idx}]
TITLE: ${c.title}
URL: ${c.url}
CONTENT: ${c.content}`).join("\n\n")}

Task:
1. Extract and classify claims for EACH source.
2. Detect if there are conflicts between these sources.

Return JSON object:
{
  "claims": {
    "0": {
      "sourceCredibility": "REGULATORY_AUTHORITY" | "PEER_REVIEWED_RESEARCH" | ...,
      "stance": "APPROVED" | "CONDITIONALLY_SAFE" | ...,
      "region": "UNITED_STATES" | "EUROPEAN_UNION" | ...,
      "confidence": 0-1,
      "claim": "Extracted claim text...",
      "rationale": "Why this classification..."
    }
  },
  "conflict": {
    "detected": boolean,
    "type": "REGIONAL" | "SCIENTIFIC" | ... (optional),
    "summary": "Brief explanation of conflict",
    "confidence": 0-1
  }
}`;

  try {
    const completion = await rateLimitedCall(() => groq.chat.completions.create({
      messages: [
        { role: "system", content: COMBINED_RESEARCH_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 1000,
    }));

    const response = completion.choices[0]?.message?.content;
    const parsed = response ? JSON.parse(cleanJson(response)) : {};

    const claims: Record<string, SourceClaim> = {};
    const rawClaims = parsed.claims || {};

    for (const [key, rawClaim] of Object.entries(rawClaims)) {
      const idx = parseInt(key);
      const originalSource = claimsData.find(c => c.idx === idx);

      if (originalSource && typeof rawClaim === 'object' && rawClaim !== null) {
        const rc = rawClaim as any;
        // Use URL as stable key if available, otherwise index
        const claimKey = originalSource.url || key;
        claims[claimKey] = {
          source: originalSource.title || originalSource.url,
          sourceUrl: originalSource.url,
          sourceCredibility: findClosestEnumValue(rc.sourceCredibility, CREDIBILITY_VALUES, "GENERAL_WEB"),
          claim: coerceToString(rc.claim || originalSource.content),
          stance: findClosestEnumValue(rc.stance, STANCE_VALUES, "UNDER_REVIEW"),
          region: findClosestEnumValue(rc.region, REGION_VALUES, "UNSPECIFIED"),
          datePublished: originalSource.publishedDate,
          confidenceInClassification: coerceToNumber(rc.confidence, 0.5),
        };
      }
    }

    const rawConflict = parsed.conflict || {};
    let conflictType: ConflictType | undefined = undefined;
    if (typeof rawConflict.type === "string") {
      conflictType = findClosestEnumValue(rawConflict.type, CONFLICT_TYPE_VALUES, CONFLICT_TYPE_VALUES[0]);
    }

    return {
      claims,
      conflict: {
        detected: coerceToBoolean(rawConflict.detected),
        type: conflictType,
        confidence: coerceToNumber(rawConflict.confidence, 0.5),
        summary: rawConflict.summary ? coerceToString(rawConflict.summary) : undefined
      }
    };

  } catch (error) {
    console.warn(`[ResearchAgent] Combined analysis failed:`, error);
    return {
      claims: {},
      conflict: { detected: false, confidence: 0.3 }
    };
  }
}

async function researchIngredient(
  ingredient: string,
  userIntent: string,
  numResults: number,
  riskLevel: IngredientRiskLevel
): Promise<IngredientResearch> {
  const queries = buildSearchQueries(ingredient, userIntent);
  const allClaims: SourceClaim[] = [];
  const errors: string[] = [];

  const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  };

  let conflictResult: CombinedResearchResult["conflict"] = {
    detected: false,
    confidence: 0,
    summary: "No conflict detected in primary analysis."
  };

  try {
    const primaryQuery = queries[0];
    if (!primaryQuery) throw new Error("No primary query generated");

    const searchResponse = await withTimeout(
      exa.search(
        primaryQuery,
        {
          type: "neural",
          numResults,
          contents: {
            summary: {
              query: `Safety, health effects, and regulatory status of ${ingredient}`,
            },
            highlights: {
              numSentences: 3,
              query: `Health risks and benefits of ${ingredient}`,
            },
            text: {
              maxCharacters: 2000,
            }
          }
        }
      ),
      config.EXA_TIMEOUT_MS
    );

    const results = (searchResponse as { results: unknown[] }).results;
    const primaryAnalysis = await analyzeResearchWithLLM(results, ingredient);

    Object.values(primaryAnalysis.claims).forEach(c => allClaims.push(c));
    conflictResult = primaryAnalysis.conflict;

    if (conflictResult.detected) {
      console.log(`Conflict detected in primary research for ${ingredient}: ${conflictResult.type}`);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    errors.push(`Primary search failed: ${errorMsg}`);
    console.warn(`[ResearchAgent] Exa search failed for "${ingredient}": ${errorMsg}`);
  }

  const needsDeepResearch = riskLevel === "HIGH_SCRUTINY" || riskLevel === "MODERATE_SCRUTINY";

  if (needsDeepResearch && allClaims.length < 3) {
    try {
      const regulatoryQuery = queries[1];
      if (!regulatoryQuery) throw new Error("No regulatory query generated");

      const regulatoryResponse = await withTimeout(
        exa.search(
          regulatoryQuery,
          {
            type: "neural",
            numResults: 2,
            contents: {
              summary: {
                query: `${ingredient} regulatory status FDA EFSA WHO`,
              },
              highlights: {
                numSentences: 3,
                query: `${ingredient} bans restrictions limits`,
              },
              text: {
                maxCharacters: 2000,
              }
            }
          }
        ),
        config.EXA_TIMEOUT_MS
      );

      const secondaryAnalysis = await analyzeResearchWithLLM(
        (regulatoryResponse as { results: unknown[] }).results,
        ingredient
      );

      Object.values(secondaryAnalysis.claims).forEach(c => allClaims.push(c));
      conflictResult = secondaryAnalysis.conflict;

    } catch (err) {
      console.warn(`[ResearchAgent] Secondary search failed for "${ingredient}"`);
    }
  }

  return {
    ingredient,
    riskLevel,
    claims: allClaims,
    conflictDetected: conflictResult.detected,
    conflictType: conflictResult.type,
    conflictSummary: conflictResult.summary,
    confidenceScore: conflictResult.confidence,
    ambiguityLevel: "medium",
    riskAssessmentReasoning: `Risk level ${riskLevel} based on LLM assessment`,
  };
}

async function performGroundedResearch(
  ingredientsToResearch: string[],
  userIntent: string,
  riskAssessments: Map<string, z.infer<typeof IngredientRiskAssessmentSchema>>
): Promise<GroundedResearchResult> {
  if (!config.EXA_API_KEY) {
    console.warn("[ResearchAgent] EXA_API_KEY not configured - skipping grounded research");
    return {
      ingredientResearch: [],
      overallConfidence: 0.5,
      unresolvedConflicts: [],
      dataQualityWarnings: ["Exa.ai API key not configured - analysis based on LLM knowledge only"],
    };
  }
   
  const riskPriority: Record<IngredientRiskLevel, number> = {
    "HIGH_SCRUTINY": 3,
    "MODERATE_SCRUTINY": 2,
    "STANDARD_REVIEW": 1,
    "GENERALLY_RECOGNIZED_SAFE": 0,
  };
  
  const sortedIngredients = [...ingredientsToResearch].sort((a, b) => {
    const aRisk = riskAssessments.get(a)?.riskLevel || "STANDARD_REVIEW";
    const bRisk = riskAssessments.get(b)?.riskLevel || "STANDARD_REVIEW";
    return riskPriority[bRisk] - riskPriority[aRisk];
  });
  
  const hasHighRisk = sortedIngredients.some(ing => {
    const risk = riskAssessments.get(ing)?.riskLevel;
    return risk === "HIGH_SCRUTINY" || risk === "MODERATE_SCRUTINY";
  });
  
  const { maxIngredients, resultsPerIngredient } = getResearchDepth(
    sortedIngredients.length, 
    hasHighRisk
  );
  
  const ingredientResearch: IngredientResearch[] = [];
  const unresolvedConflicts: string[] = [];
  const dataQualityWarnings: string[] = [];
  
  const ingredientsToProcess = sortedIngredients.slice(0, maxIngredients);
  
  console.log(`[ResearchAgent] Researching ${ingredientsToProcess.length} ingredients with ${resultsPerIngredient} results each`);
  console.log(`[ResearchAgent] Risk assessments:`, Object.fromEntries(riskAssessments));
  
  const BATCH_SIZE = 2;
  const BATCH_DELAY = 300;
  const MAX_TOTAL_TIME = config.RESEARCH_TIMEOUT_MS - 10000;
  const startTime = Date.now();
  
  for (let i = 0; i < ingredientsToProcess.length; i += BATCH_SIZE) {
    if (Date.now() - startTime > MAX_TOTAL_TIME) {
      console.warn(`[ResearchAgent] Approaching timeout, stopping research early`);
      dataQualityWarnings.push(`Research time limit reached - analyzed ${i} of ${ingredientsToProcess.length} ingredients`);
      break;
    }
    
    const batch = ingredientsToProcess.slice(i, i + BATCH_SIZE);
    
    const batchResults = await Promise.allSettled(
      batch.map(ingredient => {
        const riskLevel = riskAssessments.get(ingredient)?.riskLevel || "STANDARD_REVIEW";
        return researchIngredient(ingredient, userIntent, resultsPerIngredient, riskLevel);
      })
    );
    
    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const ingredient = batch[j];
      
      if (!ingredient || !result) continue;
      
      if (result.status === "fulfilled") {
        const research = result.value;
        ingredientResearch.push(research);
        
        if (research.conflictDetected && research.conflictSummary) {
          unresolvedConflicts.push(`${ingredient}: ${research.conflictSummary}`);
        }
        
        if (research.claims.length === 0) {
          dataQualityWarnings.push(`No external sources found for "${ingredient}"`);
        }
      } else if (result.status === "rejected") {
        const errorMsg = result.reason instanceof Error ? result.reason.message : "Unknown error";
        console.error(`[ResearchAgent] Failed to research "${ingredient}": ${errorMsg}`);
        dataQualityWarnings.push(`Research failed for "${ingredient}": ${errorMsg}`);
      }
    }
    
    if (i + BATCH_SIZE < ingredientsToProcess.length && Date.now() - startTime < MAX_TOTAL_TIME) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }
  
  const confidenceScores = ingredientResearch.map(r => r.confidenceScore);
  const overallConfidence = confidenceScores.length > 0
    ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
    : 0.5;
  
  if (sortedIngredients.length > maxIngredients) {
    dataQualityWarnings.push(
      `Research limited to ${maxIngredients} of ${sortedIngredients.length} controversial ingredients`
    );
  }
  
  return {
    ingredientResearch,
    overallConfidence,
    unresolvedConflicts,
    dataQualityWarnings,
  };
}

function formatGroundedContext(research: GroundedResearchResult): string {
  if (research.ingredientResearch.length === 0) {
    if (research.dataQualityWarnings.length > 0) {
      return `Data Quality Warnings:\n${research.dataQualityWarnings.join("\n")}\n\n[No external grounding data available - rely on training knowledge with caution]`;
    }
    return "[No external research data available]";
  }
  
  const sections: string[] = [];
  
  if (research.dataQualityWarnings.length > 0) {
    sections.push(`DATA QUALITY WARNINGS:\n${research.dataQualityWarnings.map(w => `• ${w}`).join("\n")}`);
  }
  
  if (research.unresolvedConflicts.length > 0) {
    sections.push(`REGULATORY CONFLICTS DETECTED:\n${research.unresolvedConflicts.map(c => `• ${c}`).join("\n")}`);
  }
  
  for (const ir of research.ingredientResearch) {
    const header = `RESEARCH: ${ir.ingredient.toUpperCase()}`;
    const meta = [
      `Risk Level: ${ir.riskLevel}`,
      `Confidence: ${Math.round(ir.confidenceScore * 100)}%`,
      `Ambiguity: ${ir.ambiguityLevel}`,
      ir.conflictDetected ? `Conflict (${ir.conflictType}): ${ir.conflictSummary}` : "No conflicts detected",
    ].join(" | ");
    
    const claimsSummary = ir.claims.map((c: SourceClaim, i: number) => 
      `[Source ${i + 1}: ${c.source} - ${c.sourceCredibility} (${c.region})]\n` +
      `Stance: ${c.stance} (confidence: ${Math.round(c.confidenceInClassification * 100)}%)\n` +
      `Evidence: ${c.claim.substring(0, 300)}...\n` +
      `URL: ${c.sourceUrl || "N/A"}`
    ).join("\n\n");
    
    sections.push(`${header}\n${meta}\n\n${claimsSummary || "No sources retrieved"}`);
  }
  
  sections.push(`\nOVERALL GROUNDING CONFIDENCE: ${Math.round(research.overallConfidence * 100)}%`);

  
  return sections.join("\n\n---\n\n");
}

function determineConsensusStatus(research: GroundedResearchResult): ConsensusStatus {
  if (research.ingredientResearch.length === 0) {
    return "INSUFFICIENT_DATA";
  }
  
  const totalClaims = research.ingredientResearch.reduce((acc, ir) => acc + ir.claims.length, 0);
  
  if (totalClaims < 2) {
    return "INSUFFICIENT_DATA";
  }
  
  if (research.unresolvedConflicts.length > 0) {
    return "CONFLICTING_EVIDENCE";
  }
  
  const hasConflicts = research.ingredientResearch.some(ir => ir.conflictDetected);
  if (hasConflicts) {
    return "CONFLICTING_EVIDENCE";
  }
  
  if (research.overallConfidence >= 0.7) {
    return "CLEAR_CONSENSUS";
  }
  
  return "INSUFFICIENT_DATA";
}

const NeutralGuidanceSchema = z.object({
  guidance: z.string(),
});




async function extractTradeOffContexts(research: GroundedResearchResult): Promise<TradeOffContext[]> {
  const tradeOffs: TradeOffContext[] = [];
  
  for (const ir of research.ingredientResearch) {
    // Allow single-source conflicts if the source itself discusses the controversy (e.g. a review paper)
    if (!ir.conflictDetected || ir.claims.length === 0) {
      continue;
    }
    
    const conflictType = ir.conflictType || "SCIENTIFIC";
    
    const positions: TradeOffContext["positions"] = ir.claims
      .filter((c: SourceClaim) => c.stance !== "UNDER_REVIEW")
      .slice(0, 4)
      .map((claim: SourceClaim) => ({
        source: claim.source,
        sourceCredibility: claim.sourceCredibility,
        region: claim.region,
        stance: claim.stance,
        rationale: claim.claim.substring(0, 200),
      }));



    tradeOffs.push({
      ingredient: ir.ingredient,
      conflictType,
      summary: ir.conflictSummary || "Conflicting positions detected",
      positions,
      userGuidance: `Conflicting evidence detected for ${ir.ingredient}. See positions below.`,
    });
  }

  return tradeOffs;
}

export async function researchAgent(
  ingredients: string[],
  userIntent: string,
  riskAssessmentData?: IntentInferenceResult["riskAssessment"],
  userContextBias?: string
): Promise<ResearchAgentResult> {
  return withRetry(async () => {
    const ingredientsToResearch: string[] = riskAssessmentData?.ingredientsToResearch || [];

    if (!riskAssessmentData && ingredients.length < 5) {
      ingredientsToResearch.push(...ingredients);
    }

    const riskAssessments = new Map<string, z.infer<typeof IngredientRiskAssessmentSchema>>();

    if (riskAssessmentData) {
      Object.entries(riskAssessmentData.riskDetails).forEach(([ing, details]) => {
        riskAssessments.set(ing, details);
      });
    }

    for (const ingredient of ingredientsToResearch) {
      if (!riskAssessments.has(ingredient)) {
        riskAssessments.set(ingredient, {
          riskLevel: "STANDARD_REVIEW",
          reasoning: "Review required based on general screening",
          requiresDeepResearch: true
        });
      }
    }

    console.log(`[ResearchAgent] Identified ${ingredientsToResearch.length} ingredients for research:`, ingredientsToResearch);

    let groundedResearch;
    try {
      const researchPromise = performGroundedResearch(ingredientsToResearch, userIntent, riskAssessments);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Research timeout")), config.RESEARCH_TIMEOUT_MS)
      );
      groundedResearch = await Promise.race([researchPromise, timeoutPromise]);
    } catch (error) {
      console.warn(`[ResearchAgent] Research timed out or failed, using fallback`);
      groundedResearch = {
        ingredientResearch: [],
        overallConfidence: 0.3,
        unresolvedConflicts: [],
        dataQualityWarnings: ["Research timed out - using LLM knowledge only"],
      };
    }

    const groundedContext = formatGroundedContext(groundedResearch);

    const consensusStatus = determineConsensusStatus(groundedResearch);
    const tradeOffContexts = await extractTradeOffContexts(groundedResearch);

    console.log(`[ResearchAgent] Consensus Status: ${consensusStatus}, Trade-offs: ${tradeOffContexts.length}`);

    const userContextSection = userContextBias
      ? `
      ═══════════════════════════════════════════════════════════════════
      USER CONTEXT BIAS (from session history analysis)
      ═══════════════════════════════════════════════════════════════════
      ${userContextBias}
      
      IMPORTANT: Tailor your analysis to this user's apparent goals. For example:
      - If they're bulking, emphasize protein and carb quality, not just calories
      - If they're managing allergies, prioritize cross-contamination risks
      - If they're feeding children, emphasize safety over general health
      ═══════════════════════════════════════════════════════════════════
      `
      : "";

    const conflictInstruction = consensusStatus === "CONFLICTING_EVIDENCE"
      ? `
      CRITICAL: CONFLICTING EVIDENCE DETECTED
      You MUST NOT pick a side or recommend one position over another.

      Present BOTH/ALL positions neutrally and let the user decide.
      Use phrases like:
      - "Some regulatory bodies consider... while others..."
      - "The evidence is mixed, with..."
      - "Users should be aware that different regions have different standards..."
      `
      : "";

    const analysisPrompt = `
      You are a nutritional researcher providing evidence-based analysis.
      
      USER INTENT: ${userIntent}
      INGREDIENTS: ${ingredients.join(", ")}
      CONSENSUS STATUS: ${consensusStatus}
      ${conflictInstruction}
      ${userContextSection}
      ═══════════════════════════════════════════════════════════════════
      GROUNDED RESEARCH DATA (from Exa.ai external sources)
      ═══════════════════════════════════════════════════════════════════
      ${groundedContext}
      ═══════════════════════════════════════════════════════════════════

      ANALYSIS REQUIREMENTS:
      1. GROUND your claims in the external sources above. Cite them explicitly.
      2. If CONFLICTS exist between sources (e.g., FDA vs EFSA), you MUST:
         - Explicitly state BOTH positions without favoring either
         - Explain why they differ (different risk thresholds, newer studies, etc.)
         - DO NOT make a recommendation that favors one side
         - Let the user make their own informed decision
      3. If confidence is LOW (<60%), clearly state the limitations.
      4. DO NOT make claims not supported by the grounded data.
      5. Focus on the user's specific intent: "${userIntent}"
      6. For each controversial ingredient, provide:
         - What EACH regulatory body says (cite source)
         - Regional differences presented neutrally
         - Factors the user should consider (not a recommendation)

      FORMAT: Structured, readable analysis with clear sections.
      TONE: Balanced, evidence-based, informative but NEVER prescriptive when evidence conflicts.
    `;

    const analysisCompletion = await rateLimitedCall(() => groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a nutritional researcher. 
Always cite your sources. 
When evidence conflicts, NEVER pick a side - present all positions neutrally.
Your role is to INFORM, not to DECIDE for the user.
Acknowledge uncertainty explicitly.
Never make ungrounded claims.`
        },
        { role: "user", content: analysisPrompt }
      ],
      model: "llama-3.1-8b-instant",
    }));

    const analysisText = analysisCompletion.choices[0]?.message?.content || "Unable to generate analysis.";

    const metadata = {
      sourcesConsulted: groundedResearch.ingredientResearch.reduce((acc, ir) => acc + ir.claims.length, 0),
      overallConfidence: Math.round(groundedResearch.overallConfidence * 100),
      unresolvedConflicts: groundedResearch.unresolvedConflicts.length,
      dataWarnings: groundedResearch.dataQualityWarnings.length,
    };

    const analysisWithMetadata = `${analysisText}

---
[Grounding Metadata]
Consensus Status: ${consensusStatus}
Sources Consulted: ${metadata.sourcesConsulted}
Overall Confidence: ${metadata.overallConfidence}%
Unresolved Conflicts: ${metadata.unresolvedConflicts}
Data Warnings: ${metadata.dataWarnings}
Trade-offs Identified: ${tradeOffContexts.length}
---`;

    return {
      analysis: analysisWithMetadata,
      consensusStatus,
      tradeOffContexts,
      metadata,
    };
  });
}
