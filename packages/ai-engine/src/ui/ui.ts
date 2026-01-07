import Groq from "groq-sdk";
import { z } from "zod";
import { config } from "./config";
import { withRetry, cleanJson, rateLimitedCall, DynamicUIResponseSchema, UIPropTypeSchema, type DynamicUIResponse, type ConsensusStatus, type TradeOffContext, type UIPropType } from "@repo/shared";

const groq = new Groq({ apiKey: config.GROQ_API_KEY });

export interface ConflictContext {
  consensusStatus: ConsensusStatus;
  tradeOffContexts: TradeOffContext[];
}

const PropTypeInferenceSchema = z.object({
  propTypes: z.record(z.string(), UIPropTypeSchema),
  reasoning: z.string().optional(),
});

const PROP_TYPE_INFERENCE_SYSTEM_PROMPT = `You are an expert at semantic type inference for UI component properties.

## TYPE CLASSIFICATION RULES

Determine the semantic type of each property based on its NAME, VALUE, and CONTEXT - not just primitive JavaScript types.

### Type Definitions
- text: Human-readable strings, descriptions, labels, messages
- number: Numeric values for calculations, counts, measurements
- boolean: True/false flags, toggles, binary states
- severity: Importance/risk indicators (info, warning, critical, low, medium, high, etc.)
- color: Visual color indicators or theming (any color name or purpose)
- icon: Icon identifiers, emoji, or symbol references
- list: Arrays of items (strings, objects)
- keyValue: Key-value pairs, dictionaries, maps, objects with named properties
- percentage: Proportional values (0-100 or 0-1 representing ratios)
- url: Links, references, URLs
- date: Timestamps, dates, temporal information

### Inference Guidelines
- Consider the SEMANTIC MEANING, not just the data structure
- "level" with values like "high", "medium", "low" → severity
- "score" with 0-100 → percentage
- "items" or "warnings" that are arrays → list
- "config" or "settings" objects → keyValue
- "link" or "href" → url

Output JSON with propTypes mapping property names to their semantic types.`;

async function inferPropTypesWithLLM(
  componentName: string,
  props: Record<string, unknown>
): Promise<Record<string, UIPropType>> {
  const propsDescription = Object.entries(props).map(([key, value]) => {
    const valueType = typeof value;
    const valuePreview = Array.isArray(value) 
      ? `array[${value.length}]: ${JSON.stringify(value.slice(0, 2))}`
      : valueType === "object" && value !== null
        ? `object: ${JSON.stringify(value).substring(0, 100)}`
        : `${valueType}: ${JSON.stringify(value)}`;
    return `  ${key}: ${valuePreview}`;
  }).join("\n");

  const prompt = `Infer semantic types for these UI component properties:

COMPONENT: ${componentName}

PROPERTIES:
${propsDescription}

Return JSON with propTypes mapping each property name to its semantic type.`;

  try {
    const completion = await rateLimitedCall(() => groq.chat.completions.create({
      messages: [
        { role: "system", content: PROP_TYPE_INFERENCE_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 300,
    }));

    const response = completion.choices[0]?.message?.content;
    if (!response) throw new Error("No response");

    const parsed = PropTypeInferenceSchema.parse(JSON.parse(cleanJson(response)));
    return parsed.propTypes;
  } catch (error) {
    console.warn(`[UIAgent] LLM prop type inference failed:`, error);
    const result: Record<string, UIPropType> = {};
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === "number") {
        result[key] = (value >= 0 && value <= 1) || (value >= 0 && value <= 100) ? "percentage" : "number";
      } else if (typeof value === "boolean") {
        result[key] = "boolean";
      } else if (Array.isArray(value)) {
        result[key] = value.length > 0 && typeof value[0] === "object" && value[0] !== null && "key" in value[0] 
          ? "keyValue" 
          : "list";
      } else if (typeof value === "object" && value !== null) {
        result[key] = "keyValue";
      } else {
        result[key] = "text";
      }
    }
    return result;
  }
}

export async function generateUI(
  analysis: string,
  userIntent: string,
  conflictContext?: ConflictContext
): Promise<DynamicUIResponse> {
  return withRetry(async () => {
    const hasConflicts = conflictContext?.consensusStatus === "CONFLICTING_EVIDENCE";
    const tradeOffs = conflictContext?.tradeOffContexts ?? [];
    
    const conflictSection = hasConflicts && tradeOffs.length > 0
      ? `
## CONFLICTING EVIDENCE DETECTED
The research found conflicting regulatory/scientific positions. You MUST:
1. Generate a "TradeOffCard" or "ConflictComparison" component for EACH conflict
2. Present BOTH sides neutrally - DO NOT pick a winner
3. **REQUIRED**: Include a "guidance" or "neutralContext" prop with 2-3 sentences helping the user understand the trade-off.

### Detected Trade-offs:
${tradeOffs.map((t: TradeOffContext, i: number) => `
**${i + 1}. ${t.ingredient}** (${t.conflictType} conflict)
- Summary: ${t.summary}
- Positions: ${t.positions.map((p: TradeOffContext["positions"][0]) => `${p.source} (${p.region}): ${p.stance}`).join(" vs ")}
`).join("\n")}
`
      : "";

    const consensusNote = conflictContext?.consensusStatus === "INSUFFICIENT_DATA"
      ? `
## INSUFFICIENT DATA
Limited external sources were found. Generate components that:
1. Clearly indicate data limitations

2. Show lower confidence scores
3. Suggest the user may want to research further
`
      : "";
    
    const prompt = `
You are a GENERATIVE UI ARCHITECT. Your job is to dynamically CREATE new UI component schemas tailored to the user's specific health intent, then populate them with data.

## USER CONTEXT
- **Intent/Persona**: ${userIntent}
- **Consensus Status**: ${conflictContext?.consensusStatus ?? "UNKNOWN"}
- **Analysis Data**: ${analysis}
${conflictSection}
${consensusNote}

## YOUR TASK
1. **SCHEMA GENERATION**: Create 2-5 custom component types that are SPECIFICALLY relevant to this user's intent "${userIntent}". Do NOT just use generic components.
2. **COMPONENT INSTANTIATION**: Populate instances of your generated schemas with actual data from the analysis.

## COMPONENT DESIGN RULES
- Component names should be descriptive and derived from the ACTUAL ANALYSIS CONTENT
- Name components based on what the analysis discusses (e.g., if analysis mentions caffeine levels, create "CaffeineImpact")
- Each component needs a "variant" for layout: card, banner, badge, meter, list, comparison, timeline
- Props can use these types: text, number, boolean, severity, color, icon, list, keyValue
- Include confidence scores and source attribution in metadata

## CRITICAL: Generate components from analysis, NOT from intent keywords
- Read the analysis text carefully
- Identify the key findings, warnings, or insights
- Create component names that reflect those specific findings
- DO NOT use generic names like "HealthScore" unless the analysis specifically discusses an overall health score

## EXAMPLES OF DYNAMIC COMPONENTS

For a "Pregnancy/Prenatal" intent scanning fish:
{
  "schema": {
    "generatedComponents": [
      {
        "name": "MercuryLevelGauge",
        "description": "Shows mercury content relative to FDA pregnancy limits",
        "requiredProps": [
          { "name": "level", "type": "number", "description": "Mercury in ppm" },
          { "name": "fdaLimit", "type": "number", "description": "FDA recommended limit" },
          { "name": "recommendation", "type": "text", "description": "Consumption guidance" }
        ]
      },
      {
        "name": "PregnancyWarningBanner",
        "description": "Critical warnings for pregnant women",
        "requiredProps": [
          { "name": "warnings", "type": "list", "description": "List of specific warnings" },
          { "name": "severity", "type": "severity", "description": "Overall risk level" }
        ]
      }
    ]
  },
  "components": [
    {
      "component": "MercuryLevelGauge",
      "variant": "meter",
      "priority": 1,
      "props": {
        "level": 0.3,
        "fdaLimit": 0.1,
        "recommendation": "Avoid during pregnancy - mercury exceeds safe limits"
      },
      "metadata": {
        "intent": "Pregnancy/Prenatal",
        "confidence": 0.95,
        "sources": ["FDA Guidelines", "EPA Mercury Data"]
      }
    }
  ]
}

For an "Allergy/Sensitivity" intent:
{
  "schema": {
    "generatedComponents": [
      {
        "name": "AllergenDetector",
        "description": "Identifies allergens with cross-contamination risks",
        "requiredProps": [
          { "name": "detected", "type": "list", "description": "Confirmed allergens" },
          { "name": "mayContain", "type": "list", "description": "Possible cross-contamination" },
          { "name": "severity", "type": "severity", "description": "Risk level" }
        ]
      }
    ]
  },
  "components": [...]
}

## OUTPUT FORMAT
Return ONLY valid JSON matching this structure:
{
  "schema": {
    "generatedComponents": [{ "name": string, "description": string, "requiredProps": [...] }]
  },
  "components": [{
    "component": string (must match a name from generatedComponents),
    "variant": "card"|"banner"|"badge"|"meter"|"list"|"comparison"|"timeline",
    "priority": number (1-10, lower = more important),
    "props": { ... matches the requiredProps schema ... },
    "metadata": { "intent": string, "confidence": number, "sources": string[] }
  }],
  "layoutHints": {
    "primaryComponent": string (optional, which component is most important),
    "grouping": [[string, string], ...] (optional, components to display together)
  }
}

CRITICAL: Generate components that are UNIQUE to this specific intent and analysis. A "Pediatric Safety" scan should NOT produce the same components as a "Fitness Performance" scan!
`;

    const chatCompletion = await rateLimitedCall(() => groq.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: "You are a generative UI architect that creates dynamic, intent-specific component schemas. You design UI structures that perfectly match user needs. Output only valid JSON." 
        },
        { role: "user", content: prompt },
      ],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      temperature: 0.7,
    }));

    const content = chatCompletion.choices[0]?.message?.content;
    if (!content) throw new Error("No content received from Generative UI Agent");

    const parsed = JSON.parse(cleanJson(content));
    
    const result = DynamicUIResponseSchema.safeParse(parsed);

    if (!result.success) {
      return await attemptFlexibleRecovery(parsed, userIntent);
    }
    
    await validateComponentsMatchSchema(result.data);
    
    return result.data;
  });
}

async function attemptFlexibleRecovery(parsed: unknown, userIntent: string): Promise<DynamicUIResponse> {
  if (parsed && typeof parsed === "object" && "components" in parsed) {
    const components = (parsed as { components: unknown[] }).components;
    if (Array.isArray(components) && components.length > 0) {
      const generatedComponents = await inferSchemaFromComponentsWithLLM(components);
      
      const normalizedComponents = await Promise.all(
        components.map((c, i) => normalizeComponent(c, i, userIntent))
      );
      
      return {
        schema: { generatedComponents },
        components: normalizedComponents,
        layoutHints: { primaryComponent: (components[0] as { component?: string })?.component },
      };
    }
  }
  
  return {
    schema: {
      generatedComponents: [{
        name: "AnalysisResult",
        description: "General analysis output",
        requiredProps: [
          { name: "content", type: "text", description: "Analysis content" },
          { name: "severity", type: "severity", description: "Importance level" },
        ],
      }],
    },
    components: [{
      component: "AnalysisResult",
      variant: "card",
      priority: 1,
      props: { 
        content: "Unable to generate specialized UI. Please check the raw analysis.",
        severity: "info",
      },
      metadata: { intent: userIntent, confidence: 0.3, sources: [] },
    }],
  };
}

async function inferSchemaFromComponentsWithLLM(
  components: unknown[]
): Promise<DynamicUIResponse["schema"]["generatedComponents"]> {
  const schemaMap = new Map<string, { 
    name: string; 
    description: string; 
    requiredProps: { name: string; type: UIPropType; description: string }[] 
  }>();
  
  for (const comp of components) {
    if (typeof comp !== "object" || !comp || !("component" in comp)) continue;
    const c = comp as { component: string; props?: Record<string, unknown> };
    
    if (!schemaMap.has(c.component)) {
      schemaMap.set(c.component, {
        name: c.component,
        description: `Auto-inferred component: ${c.component}`,
        requiredProps: [],
      });
    }
    
    const schema = schemaMap.get(c.component)!;
    if (c.props && typeof c.props === "object") {
      const propTypes = await inferPropTypesWithLLM(c.component, c.props);
      
      for (const [key, value] of Object.entries(c.props)) {
        if (!schema.requiredProps.find(p => p.name === key)) {
          schema.requiredProps.push({
            name: key,
            type: propTypes[key] || "text",
            description: `Auto-inferred: ${key}`,
          });
        }
      }
    }
  }
  
  return Array.from(schemaMap.values());
}

async function normalizeComponent(
  comp: unknown, 
  index: number, 
  userIntent: string
): Promise<DynamicUIResponse["components"][0]> {
  const c = comp as Partial<DynamicUIResponse["components"][0]>;
  
  const normalizedProps: Record<string, unknown> = {};
  if (c.props && typeof c.props === "object") {
    for (const [key, value] of Object.entries(c.props)) {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        normalizedProps[key] = JSON.stringify(value);
      } else {
        normalizedProps[key] = value;
      }
    }
  }
  
  return {
    component: c.component || `Component${index}`,
    variant: c.variant || "card",
    priority: c.priority || index + 1,
    props: normalizedProps,
    metadata: {
      intent: c.metadata?.intent || userIntent,
      confidence: c.metadata?.confidence || 0.5,
      sources: c.metadata?.sources || [],
    },
  };
}

async function validateComponentsMatchSchema(response: DynamicUIResponse): Promise<void> {
  const schemaNames = new Set(
    response.schema.generatedComponents.map((c: DynamicUIResponse["schema"]["generatedComponents"][0]) => c.name)
  );
  
  for (const component of response.components) {
    if (!schemaNames.has(component.component)) {
      const normalizedProps: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(component.props)) {
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          normalizedProps[key] = JSON.stringify(value);
        } else {
          normalizedProps[key] = value;
        }
      }
      component.props = normalizedProps;
      
      const propTypes = await inferPropTypesWithLLM(component.component, normalizedProps);
      
      response.schema.generatedComponents.push({
        name: component.component,
        description: `Dynamically added: ${component.component}`,
        requiredProps: Object.entries(normalizedProps).map(([name, _]) => ({
          name,
          type: propTypes[name] || "text",
          description: `Auto-inferred from component`,
        })),
      });
    }
  }
}
