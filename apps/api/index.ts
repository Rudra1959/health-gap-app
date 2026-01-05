console.log("Hello via Bun!");
import { Hono } from "hono";
import { envSchema } from "@repo/packages/env";

const app = new Hono();

const env = envSchema.parse(process.env);

app.get("/health", (c) => {
  return c.json({ ok: true });
});

export default {
  port: 3000,
  fetch: app.fetch,
};