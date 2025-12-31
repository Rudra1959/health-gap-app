import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  GROQ_API_KEY: z.string().min(1),
  EXA_API_KEY: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  PORT: z.string().default("3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  GLOBAL_TIMEOUT_MS: z.string().transform(Number).default("55000"),
  RESEARCH_TIMEOUT_MS: z.string().transform(Number).default("35000"),
  EXA_TIMEOUT_MS: z.string().transform(Number).default("15000"),
  RETRY_ATTEMPTS: z.string().transform(Number).default("3"),
  RETRY_DELAY_MS: z.string().transform(Number).default("1000"),
  RETRY_BACKOFF: z.string().transform(Number).default("2"),
});

export const config = envSchema.parse(process.env);
