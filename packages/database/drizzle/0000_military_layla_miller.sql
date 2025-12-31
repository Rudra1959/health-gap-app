CREATE TABLE "scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_url" text NOT NULL,
	"detected_text" text,
	"health_score" integer,
	"user_intent_category" text,
	"timestamp" timestamp DEFAULT now()
);
