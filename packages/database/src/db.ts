import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

export function createDb(url?: string) {
  if (!url) return null;
  const client = postgres(url, { max: 10, ssl: "require" });
  return drizzle(client);
}
