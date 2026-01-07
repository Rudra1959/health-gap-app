import { z } from "zod";

const EnvSchema = z.object({
  GROQ_API_KEY: z.string().min(1),
});

export const config = EnvSchema.parse(process.env);
