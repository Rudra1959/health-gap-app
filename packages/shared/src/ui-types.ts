import { z } from "zod";

/* ---------- enums ---------- */

export type ConsensusStatus =
  | "CONSENSUS"
  | "CONFLICTING_EVIDENCE"
  | "INSUFFICIENT_DATA";

/* ---------- UI prop types ---------- */

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

export type UIPropType = z.infer<typeof UIPropTypeSchema>;

/* ---------- Trade-off ---------- */

export const TradeOffContextSchema = z.object({
  ingredient: z.string(),
  conflictType: z.string(),
  summary: z.string(),
  positions: z.array(
    z.object({
      source: z.string(),
      region: z.string(),
      stance: z.string(),
    })
  ),
});

export type TradeOffContext = z.infer<typeof TradeOffContextSchema>;

/* ---------- Dynamic UI ---------- */

export const DynamicUIResponseSchema = z.object({
  schema: z.object({
    generatedComponents: z.array(
      z.object({
        name: z.string(),
        description: z.string(),
        requiredProps: z.array(
          z.object({
            name: z.string(),
            type: UIPropTypeSchema,
            description: z.string(),
          })
        ),
      })
    ),
  }),
  components: z.array(
    z.object({
      component: z.string(),
      variant: z.string(),
      priority: z.number(),
      props: z.record(z.any()),
      metadata: z.object({
        intent: z.string(),
        confidence: z.number(),
        sources: z.array(z.string()),
      }),
    })
  ),
  layoutHints: z
    .object({
      primaryComponent: z.string().optional(),
      grouping: z.array(z.array(z.string())).optional(),
    })
    .optional(),
});

export type DynamicUIResponse = z.infer<typeof DynamicUIResponseSchema>;
/* ---------- Exported Types ---------- */