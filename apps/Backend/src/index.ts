import { Hono } from "hono";
const app = new Hono();
const routes = app.get("/scan", (c) => c.json({ status: "ready" }));
export type AppType = typeof routes;
export default app;
