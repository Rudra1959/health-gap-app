import { z } from "zod";
import { Redis } from "@upstash/redis";
import { config } from "./config";

const ScanResultSchema = z.object({
  productName: z.string(),
  userIntent: z.string().optional(),
  healthScore: z.number().nullable().optional(),
  timestamp: z.string(),
});

type ScanResult = z.infer<typeof ScanResultSchema>;

export const redis = new Redis({
  url: config.UPSTASH_REDIS_REST_URL || "",
  token: config.UPSTASH_REDIS_REST_TOKEN || "",
});

export async function saveScanHistory(
  sessionId: string,
  scanResult: ScanResult
): Promise<void> {
  if (!config.UPSTASH_REDIS_REST_URL || !config.UPSTASH_REDIS_REST_TOKEN) {
    return;
  }

  const validatedSessionId = z.string().min(1).parse(sessionId);
  const validatedResult = ScanResultSchema.parse(scanResult);

  const key = `history:${validatedSessionId}`;
  await redis.lpush(key, JSON.stringify(validatedResult));
  await redis.ltrim(key, 0, 49);
}

export async function getRecentPatterns(sessionId: string): Promise<ScanResult[]> {
  if (!config.UPSTASH_REDIS_REST_URL || !config.UPSTASH_REDIS_REST_TOKEN) {
    return [];
  }

  const validatedSessionId = z.string().min(1).parse(sessionId);
  const key = `history:${validatedSessionId}`;
  
  const history = await redis.lrange(key, 0, 4);
  
  return history
    .map(item => {
      try {
        const parsed = typeof item === "string" ? JSON.parse(item) : item;
        return ScanResultSchema.parse(parsed);
      } catch {
        return null;
      }
    })
    .filter((item): item is ScanResult => item !== null);
}

