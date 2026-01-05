import { z } from "zod";

export const envSchema = z.object({
  API_URL: z.string().url(),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
});

export type Env = z.infer<typeof envSchema>;
