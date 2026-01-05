/// <reference types="node" />
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      "postgres://postgres:postgres@localhost:5432/health_gap_db",
  },
});
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function createDb(url: string) {
  const client = postgres(url, { max: 10 });
  return drizzle(client);
}