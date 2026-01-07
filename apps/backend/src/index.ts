import { Hono } from "hono";
import { cors } from "hono/cors";
import { chatRoute } from "./routes/chat";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*", // 🔒 lock this to frontend domain in prod
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })
);

app.route("/api/chat", chatRoute);

app.get("/", (c) => c.text("EatWise backend running ✅"));

export default app;
