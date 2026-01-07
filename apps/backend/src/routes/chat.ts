import { Hono } from "hono";
import { z } from "zod";
import OpenAI from "openai";

export const chatRoute = new Hono();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/* =====================================================
   SCHEMA
===================================================== */
const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
});

/* =====================================================
   SIMPLE IN-MEMORY RATE GUARD (DEV SAFE)
===================================================== */
let lastCallAt = 0;
const COOLDOWN_MS = 15_000; // 15 seconds

/* =====================================================
   POST /api/chat
===================================================== */
chatRoute.post("/", async (c) => {
  try {
    const now = Date.now();

    // 🛑 HARD COOLDOWN
    if (now - lastCallAt < COOLDOWN_MS) {
      return c.json({
        message: "I’m thinking… please wait a few seconds before asking again.",
      });
    }

    lastCallAt = now;

    const body = await c.req.json();
    const { messages } = ChatRequestSchema.parse(body);

    let reply =
      "I’m temporarily overloaded. Please wait a moment and try again.";

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are EatWise, a calm nutrition assistant. Explain ingredients clearly and practically.",
          },
          ...messages.slice(-6), // 🔥 token protection
        ],
      });

      reply = completion.choices[0]?.message?.content ?? reply;
    } catch (err: any) {
      // ✅ Rate limit safe handling
      if (err?.status === 429) {
        console.warn("⚠️ OpenAI rate limit hit");
        reply =
          "I’m getting a lot of requests right now. Please try again shortly.";
      } else {
        console.error("❌ OpenAI error:", err);
      }
    }

    return c.json({ message: reply });
  } catch (err) {
    console.error("❌ Chat handler error:", err);

    // 🚑 NEVER BREAK FRONTEND
    return c.json({
      message: "Something went wrong on my side. Please try again in a moment.",
    });
  }
});
