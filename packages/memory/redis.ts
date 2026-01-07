import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;

export async function remember(sessionId: string, memory: any) {
  if (!redis) return;
  await redis.lpush(`memory:${sessionId}`, JSON.stringify(memory));
  await redis.ltrim(`memory:${sessionId}`, 0, 20);
}

export async function recall(sessionId: string) {
  if (!redis) return [];
  const items = await redis.lrange(`memory:${sessionId}`, 0, 5);
  return items.map((i) => JSON.parse(i));
}
