import { Hono } from "hono";
import { getDailyHabits } from "@repo/memory";
import { generateDailyInsight } from "@repo/ai-engine";

export const insightRoute = new Hono();

insightRoute.get("/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");

  const habits = await getDailyHabits(sessionId);
  const insight = generateDailyInsight(habits);

  return c.json({ insight });
});
