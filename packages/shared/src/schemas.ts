import { z } from "zod";

export const ScanRequestSchema = z.object({
  inputType: z.enum(["barcode", "image", "text"]),
  value: z.string(),
  sessionId: z.string().optional(),
  context: z
    .object({
      age: z.number().optional(),
      goal: z.string().optional(),
      conditions: z.array(z.string()).optional(),
    })
    .optional(),
});
