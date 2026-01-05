export * from "./db";
export * from "./schema";
export * from "./redis";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function createDb(url: string) {
  const client = postgres(url, { max: 10 });
  return drizzle(client);
}