import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const scans = pgTable("scans", {
  id: serial("id").primaryKey(),
  input: text("input"),
  healthScore: integer("health_score"),
  summary: text("summary"),
  timestamp: timestamp("timestamp").defaultNow(),
});
