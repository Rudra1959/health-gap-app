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
  type SourceClaim,
  type IngredientResearch,
  type SafetyStance,
  type SourceCredibilityCategory,
  type Region,
  type ConflictType,
  type IngredientRiskLevel,
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

const ClaimClassificationSchema = z.object({
  sourceCredibility: SourceCredibilityCategorySchema,
  stance: SafetyStanceSchema,
  region: RegionSchema,
  confidenceInClassification: z.number().min(0).max(1),
  reasoning: z.string(),
});

const IngredientRiskAssessmentSchema = z.object({
  riskLevel: IngredientRiskLevelSchema,
  reasoning: z.string(),
  requiresDeepResearch: z.boolean(),
});

const ConflictAnalysisSchema = z.object({
  conflictDetected: z.boolean(),
  conflictType: ConflictTypeSchema.optional(),
  conflictSummary: z.string().optional(),
  confidenceScore: z.number().min(0).max(1),
  ambiguityLevel: z.enum(["low", "medium", "high"]),
  reasoning: z.string(),
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

const CLAIM_CLASSIFICATION_SYSTEM_PROMPT = `You are an expert at analyzing health and regulatory information sources.

## CLASSIFICATION RULES

### Source Credibility Assessment
Determine source authority based on:
- Institutional backing and mandate (government agencies have highest authority)
- Peer-review processes (academic journals with rigorous review processes)
- Editorial standards and accountability
- Track record of accuracy and corrections
- Potential conflicts of interest

Categories (in order of typical authority):
- REGULATORY_AUTHORITY: Government bodies with legal mandate for food/drug safety
- PEER_REVIEWED_RESEARCH: Academic publications with formal peer review
- INSTITUTIONAL_RESEARCH: University or major research institution publications
- INDUSTRY_PUBLICATION: Trade publications, may have industry funding
- NEWS_MEDIA: Journalism with editorial standards
- GENERAL_WEB: Unverified sources, blogs, forums

### Safety Stance Determination
Analyze the SEMANTIC MEANING of the content, not specific keywords:
- APPROVED: Clear endorsement, explicit safety declaration, regulatory clearance
- CONDITIONALLY_SAFE: Safe with caveats, specific conditions, or dose limits
- UNDER_REVIEW: Pending evaluation, ongoing studies, no conclusion yet
- CAUTION_ADVISED: Concerns expressed, risks identified, monitoring recommended
- RESTRICTED: Limited use permitted, special warnings required
- PROHIBITED: Banned, illegal, explicitly forbidden

### Region Identification
Infer geographic context from:
- Institutional references (which regulatory body is cited)
- Legal frameworks mentioned
- Geographic scope of studies or regulations
- Language and regulatory terminology used

Output ONLY valid JSON matching the required schema.`;

const INGREDIENT_RISK_SYSTEM_PROMPT = `You are an expert toxicologist and food safety scientist.

## RISK ASSESSMENT RULES

Evaluate ingredient risk based on PRINCIPLES, not specific ingredient names:

### High Scrutiny Indicators
- History of regulatory bans or restrictions in any major jurisdiction
- Ongoing scientific controversy with active research disputes
- Known bioactive mechanisms that could cause harm at dietary levels
- Previous recalls or safety incidents
- Synthetic compounds mimicking natural substances

### Moderate Scrutiny Indicators  
- Mixed regulatory status across jurisdictions
- Some populations more sensitive (children, pregnant, elderly)
- Dose-dependent safety concerns
- Emerging research suggesting potential issues

### Standard Review Indicators
- Generally accepted but with some historical controversy
- Natural compounds with long history of safe use
- Minor processing aids or technical additives

### Generally Recognized Safe Indicators
- Long history of safe consumption across cultures
- Whole food ingredients or their direct derivatives
- Well-understood metabolism and no accumulation concerns

CRITICAL: Do NOT use ingredient name matching. Evaluate based on your knowledge of the compound's properties, regulatory history, and scientific evidence.

Output ONLY valid JSON matching the required schema.`;

const CONFLICT_ANALYSIS_SYSTEM_PROMPT = `You are an expert at analyzing scientific and regulatory disagreements.

## CONFLICT DETECTION RULES

Analyze the claims semantically to determine if genuine conflict exists:

### Conflict Types
- REGIONAL: Different jurisdictions have genuinely different standards (not just labeling differences)
- SCIENTIFIC: Competing interpretations of research data, methodology disputes
- DOSAGE: Disagreement on safe consumption levels or acceptable daily intake
- POPULATION: Different risk profiles for demographics (children, pregnant, immunocompromised)
- TEMPORAL: Old vs new research with contradictory findings
- METHODOLOGICAL: Disagreement on study validity, design, or interpretation

### True Conflict vs Apparent Conflict
A TRUE conflict exists when:
- Sources with similar credibility reach opposite conclusions
- Regulatory bodies in comparable jurisdictions make different decisions
- Well-designed studies produce contradictory results

An APPARENT conflict (not a real conflict) exists when:
- A low-credibility source disagrees with high-credibility sources
- Outdated information contradicts current consensus
- Different contexts are being compared (therapeutic vs dietary use)

### Confidence Assessment
- High confidence: Multiple high-quality sources with clear positions
- Medium confidence: Limited sources or some ambiguity in positions
- Low confidence: Few sources, unclear positions, or data quality issues

Output ONLY valid JSON matching the required schema.`;

async function classifyClaimWithLLM(
  content: string,
  url: string,
  title: string,
  ingredient: string
): Promise<z.infer<typeof ClaimClassificationSchema>> {
  const prompt = `Analyze this source and classify it:

SOURCE URL: ${url}
SOURCE TITLE: ${title}
INGREDIENT BEING RESEARCHED: ${ingredient}
CONTENT EXCERPT: ${content.substring(0, 1000)}

Classify the source credibility, safety stance regarding ${ingredient}, and geographic region.
Return JSON with: sourceCredibility, stance, region, confidenceInClassification (0-1), reasoning`;

  try {
    const completion = await rateLimitedCall(() => groq.chat.completions.create({
      messages: [
        { role: "system", content: CLAIM_CLASSIFICATION_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 300,
    }));

    const response = completion.choices[0]?.message?.content;
    if (!response) throw new Error("No response from LLM");

    const raw = JSON.parse(cleanJson(response));
    
    const normalized = {
      sourceCredibility: findClosestEnumValue(raw.sourceCredibility, CREDIBILITY_VALUES, "GENERAL_WEB"),
      stance: findClosestEnumValue(raw.stance, STANCE_VALUES, "UNDER_REVIEW"),
      region: findClosestEnumValue(raw.region, REGION_VALUES, "UNSPECIFIED"),
      confidenceInClassification: coerceToNumber(raw.confidenceInClassification, 0.5),
      reasoning: coerceToString(raw.reasoning),
    };

    return ClaimClassificationSchema.parse(normalized);
  } catch (error) {
    console.warn(`[ResearchAgent] LLM classification failed:`, error);
    return {
      sourceCredibility: "GENERAL_WEB",
      stance: "UNDER_REVIEW",
      region: "UNSPECIFIED",
      confidenceInClassification: 0.3,
      reasoning: "Classification failed",
    };
  }
}

async function assessIngredientRiskWithLLM(
  ingredients: string[],
  userIntent: string
): Promise<Map<string, z.infer<typeof IngredientRiskAssessmentSchema>>> {
  const prompt = `Assess the risk level for these ingredients in the context of: "${userIntent}"

INGREDIENTS: ${ingredients.join(", ")}

For each ingredient, determine:
1. riskLevel: HIGH_SCRUTINY | MODERATE_SCRUTINY | STANDARD_REVIEW | GENERALLY_RECOGNIZED_SAFE
2. reasoning: Why this risk level
3. requiresDeepResearch: Whether this ingredient needs external source verification

Return JSON object with ingredient names as keys.`;

  try {
    const completion = await rateLimitedCall(() => groq.chat.completions.create({
      messages: [
        { role: "system", content: INGREDIENT_RISK_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 500,
    }));

    const response = completion.choices[0]?.message?.content;
    if (!response) throw new Error("No response from LLM");

    const parsed = JSON.parse(cleanJson(response));
    const result = new Map<string, z.infer<typeof IngredientRiskAssessmentSchema>>();

    for (const ingredient of ingredients) {
      const assessment = parsed[ingredient] || parsed[ingredient.toLowerCase()];
      if (assessment) {
        const normalized = {
          riskLevel: findClosestEnumValue(assessment.riskLevel, RISK_LEVEL_VALUES, "STANDARD_REVIEW"),
          reasoning: coerceToString(assessment.reasoning),
          requiresDeepResearch: coerceToBoolean(assessment.requiresDeepResearch),
        };
        result.set(ingredient, IngredientRiskAssessmentSchema.parse(normalized));
      } else {
        result.set(ingredient, {
          riskLevel: "STANDARD_REVIEW",
          reasoning: "No assessment provided",
          requiresDeepResearch: true,
        });
      }
    }

    return result;
  } catch (error) {
    console.warn(`[ResearchAgent] Risk assessment failed:`, error);
    const result = new Map<string, z.infer<typeof IngredientRiskAssessmentSchema>>();
    for (const ingredient of ingredients) {
      result.set(ingredient, {
        riskLevel: "STANDARD_REVIEW",
        reasoning: "Risk assessment failed, using default",
        requiresDeepResearch: true,
      });
    }
    return result;
  }
}

async function analyzeConflictsWithLLM(
  claims: SourceClaim[],
  ingredient: string
): Promise<z.infer<typeof ConflictAnalysisSchema>> {
  if (claims.length === 0) {
    return {
      conflictDetected: false,
      confidenceScore: 0.3,
      ambiguityLevel: "high",
      reasoning: "No claims to analyze",
    };
  }

  const claimsSummary = claims.map((c, i) => 
    `[${i + 1}] ${c.source} (${c.sourceCredibility}, ${c.region}): ${c.stance} - "${c.claim.substring(0, 200)}"`
  ).join("\n");

  const prompt = `Analyze these claims about "${ingredient}" for conflicts:

${claimsSummary}

Determine if there are genuine conflicts between sources, the type of conflict, and overall confidence.
Return JSON with: conflictDetected, conflictType (if detected), conflictSummary, confidenceScore, ambiguityLevel, reasoning`;

  try {
    const completion = await rateLimitedCall(() => groq.chat.completions.create({
      messages: [
        { role: "system", content: CONFLICT_ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 400,
    }));

    const response = completion.choices[0]?.message?.content;
    if (!response) throw new Error("No response from LLM");

    const raw = JSON.parse(cleanJson(response));
    const ambiguityOptions = ["low", "medium", "high"] as const;
    
    let normalizedConflictType: typeof CONFLICT_TYPE_VALUES[number] | undefined = undefined;
    if (typeof raw.conflictType === "string") {
      normalizedConflictType = findClosestEnumValue(raw.conflictType, CONFLICT_TYPE_VALUES, CONFLICT_TYPE_VALUES[0]);
    }
    
    const normalized = {
      conflictDetected: coerceToBoolean(raw.conflictDetected),
      conflictType: normalizedConflictType,
      conflictSummary: raw.conflictSummary ? coerceToString(raw.conflictSummary) : undefined,
      confidenceScore: coerceToNumber(raw.confidenceScore, 0.5),
      ambiguityLevel: findClosestEnumValue(raw.ambiguityLevel, ambiguityOptions, "medium"),
      reasoning: coerceToString(raw.reasoning),
    };

    return ConflictAnalysisSchema.parse(normalized);
  } catch (error) {
    console.warn(`[ResearchAgent] Conflict analysis failed:`, error);
    return {
      conflictDetected: false,
      confidenceScore: 0.5,
      ambiguityLevel: "medium",
      reasoning: "Conflict analysis failed",
    };
  }
}

function getResearchDepth(ingredientCount: number, hasHighRisk: boolean): { 
  maxIngredients: number; 
  resultsPerIngredient: number;
} {
  if (ingredientCount <= 2) {
    return { maxIngredients: 2, resultsPerIngredient: hasHighRisk ? 3 : 2 };
  } else if (ingredientCount <= 4) {
    return { maxIngredients: 3, resultsPerIngredient: 2 };
  } else {
    return { maxIngredients: 4, resultsPerIngredient: 1 };
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

async function extractClaimsFromResultsWithLLM(
  results: any[], 
  ingredient: string
): Promise<SourceClaim[]> {
  const claims: SourceClaim[] = [];
  
  for (const result of results) {    // Use Exa's AI-generated summary (much more concise than raw text/highlights)
    const content = result.summary || result.highlights?.join(" ") || result.text || "";
    const title = result.title || "";
    const url = result.url || "";
    
    const classification = await classifyClaimWithLLM(content, url, title, ingredient);
    
    claims.push({
      source: title || url,
      sourceUrl: url,
      sourceCredibility: classification.sourceCredibility,
      claim: content,
      stance: classification.stance,
      region: classification.region,
      datePublished: result.publishedDate,
      confidenceInClassification: classification.confidenceInClassification,
    });
  }
  
  return claims;
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
  
  try {
    const primaryQuery = queries[0];
    if (!primaryQuery) throw new Error("No primary query generated");
    
    const searchResponse = await withTimeout(
      exa.searchAndContents(
        primaryQuery,
        {
          type: "neural",
          useAutoprompt: true,
          numResults,
          summary: {
            query: `Safety, health effects, and regulatory status of ${ingredient}`,
          },
        } as Parameters<typeof exa.searchAndContents>[1]
      ),
      config.EXA_TIMEOUT_MS
    );
    
    const claims = await extractClaimsFromResultsWithLLM(
      (searchResponse as { results: unknown[] }).results, 
      ingredient
    );
    allClaims.push(...claims);
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
        exa.searchAndContents(
          regulatoryQuery,
          {
            type: "neural",
            useAutoprompt: true,
            numResults: 2,
            summary: {
              query: `Regulatory status and safety assessment of ${ingredient}`,
            },
          } as Parameters<typeof exa.searchAndContents>[1]
        ),
        config.EXA_TIMEOUT_MS
      );
      
      const claims = await extractClaimsFromResultsWithLLM(
        (regulatoryResponse as { results: unknown[] }).results, 
        ingredient
      );
      allClaims.push(...claims);
    } catch (err) {
      console.warn(`[ResearchAgent] Secondary search failed for "${ingredient}"`);
    }
  }
  
  const conflictAnalysis = await analyzeConflictsWithLLM(allClaims, ingredient);
  
  return {
    ingredient,
    riskLevel,
    claims: allClaims,
    conflictDetected: conflictAnalysis.conflictDetected,
    conflictType: conflictAnalysis.conflictType,
    conflictSummary: conflictAnalysis.conflictSummary,
    confidenceScore: conflictAnalysis.confidenceScore,
    ambiguityLevel: conflictAnalysis.ambiguityLevel,
    riskAssessmentReasoning: `Risk level ${riskLevel} based on LLM assessment`,
  };
}

async function performGroundedResearch(
  ingredientsToResearch: string[],
  userIntent: string
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
  
  const riskAssessments = await assessIngredientRiskWithLLM(ingredientsToResearch, userIntent);
  
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

async function generateNeutralGuidanceWithLLM(
  ingredient: string,
  conflictType: ConflictType,
  positions: TradeOffContext["positions"]
): Promise<string> {
  const positionsSummary = positions.map(p => 
    `${p.source} (${p.region}): ${p.stance}`
  ).join("; ");

  const prompt = `Generate neutral, non-prescriptive guidance for a user about "${ingredient}".

CONFLICT TYPE: ${conflictType}
POSITIONS: ${positionsSummary}

RULES:
- Do NOT recommend one position over another
- Do NOT tell the user what to do
- DO explain what factors they might consider
- DO acknowledge the complexity
- Keep it to 2-3 sentences

Return JSON with: { "guidance": "..." }`;

  try {
    const completion = await rateLimitedCall(() => groq.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: "You generate neutral, balanced guidance that helps users understand trade-offs without prescribing action. Never favor one regulatory position over another."
        },
        { role: "user", content: prompt },
      ],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 150,
    }));

    const response = completion.choices[0]?.message?.content;
    if (!response) throw new Error("No response");

    const parsed = NeutralGuidanceSchema.parse(JSON.parse(cleanJson(response)));
    return parsed.guidance;
  } catch {
    return `Multiple perspectives exist on ${ingredient} (${conflictType.toLowerCase()} considerations). Review the positions above to make an informed choice based on your personal situation.`;
  }
}

async function extractTradeOffContexts(research: GroundedResearchResult): Promise<TradeOffContext[]> {
  const tradeOffs: TradeOffContext[] = [];
  
  for (const ir of research.ingredientResearch) {
    if (!ir.conflictDetected || ir.claims.length < 2) {
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
    
    const userGuidance = await generateNeutralGuidanceWithLLM(
      ir.ingredient,
      conflictType,
      positions
    );
    
    tradeOffs.push({
      ingredient: ir.ingredient,
      conflictType,
      summary: ir.conflictSummary || "Conflicting positions detected",
      positions,
      userGuidance,
    });
  }
  
  return tradeOffs;
}

export async function researchAgent(
  ingredients: string[], 
  userIntent: string,
  userContextBias?: string
): Promise<ResearchAgentResult> {
  return withRetry(async () => {
    const identificationPrompt = `
      Given the user intent '${userIntent}' and this list of ingredients: ${ingredients.join(", ")}.
      Identify which ingredients are controversial, obscure, or have conflicting health data.
      Consider: artificial additives, preservatives, colorings, sweeteners, compounds with regional bans.
      
      ${userContextBias ? `USER CONTEXT: ${userContextBias}` : ""}
      
      Return a JSON object with:
      {
        "ingredientsToResearch": ["ingredient1", "ingredient2"],
        "riskAssessment": {
          "ingredient1": "high|medium|low",
          "ingredient2": "high|medium|low"
        }
      }
      
      If none need research, return empty arrays.
    `;

    const idCompletion = await rateLimitedCall(() => groq.chat.completions.create({
      messages: [{ role: "user", content: identificationPrompt }],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
    }));

    const idContent = idCompletion.choices[0]?.message?.content;
    const parsedId = idContent ? JSON.parse(cleanJson(idContent)) : { ingredientsToResearch: [] };
    const ingredientsToResearch: string[] = parsedId.ingredientsToResearch || [];

    console.log(`[ResearchAgent] Identified ${ingredientsToResearch.length} ingredients for research:`, ingredientsToResearch);

    await new Promise(resolve => setTimeout(resolve, 300));

    let groundedResearch;
    try {
      const researchPromise = performGroundedResearch(ingredientsToResearch, userIntent);
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

    await new Promise(resolve => setTimeout(resolve, 300));

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
