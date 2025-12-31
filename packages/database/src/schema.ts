import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const scans = pgTable('scans', {
  id: serial('id').primaryKey(),
  imageUrl: text('image_url').notNull(),
  detectedText: text('detected_text'),
  healthScore: integer('health_score'),
  userIntentCategory: text('user_intent_category'),
  timestamp: timestamp('timestamp').defaultNow(),
});
