import { z } from "zod";

const envSchema = z.object({
  GROQ_API_KEY: z.string().min(1),
  EXA_API_KEY: z.string().optional(),
  GLOBAL_TIMEOUT_MS: z.string().default("120000").transform(Number),
  RESEARCH_TIMEOUT_MS: z.string().default("35000").transform(Number),
  EXA_TIMEOUT_MS: z.string().default("15000").transform(Number),
  RETRY_ATTEMPTS: z.string().default("3").transform(Number),
  RETRY_DELAY_MS: z.string().default("1000").transform(Number),
  RETRY_BACKOFF: z.string().default("2").transform(Number),
});

export const config = envSchema.parse(process.env);
