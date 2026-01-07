import { Hono } from "hono";

export const healthRoute = new Hono();

healthRoute.get("/", (c) =>
  c.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })
);
