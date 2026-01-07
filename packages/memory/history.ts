import { z } from "zod";
import { redis } from "./redis";

const ScanHistorySchema = z.object({
  productName: z.string(),
  ingredients: z.array(z.string()),
  healthScore: z.number().optional(),
  timestamp: z.string(),
});

export type ScanHistoryItem = z.infer<typeof ScanHistorySchema>;

export async function saveScanHistory(
  sessionId: string,
  item: ScanHistoryItem
): Promise<void> {
  if (!redis) return;

  try {
    const validated = ScanHistorySchema.parse(item);
    const key = `history:${sessionId}`;

    await redis.lpush(key, JSON.stringify(validated));
    await redis.ltrim(key, 0, 9); // keep last 10
  } catch {
    // NEVER throw
  }
}

export async function getRecentScanHistory(
  sessionId: string
): Promise<ScanHistoryItem[]> {
  if (!redis) return [];

  try {
    const key = `history:${sessionId}`;
    const raw = await redis.lrange(key, 0, 4);

    return raw
      .map((r) => {
        try {
          return ScanHistorySchema.parse(
            typeof r === "string" ? JSON.parse(r) : r
          );
        } catch {
          return null;
        }
      })
      .filter((v): v is ScanHistoryItem => v !== null);
  } catch {
    return [];
  }
}
