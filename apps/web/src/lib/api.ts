import { hc } from "hono/client";
import type { AppType } from "@app/backend";
export const client = hc<AppType>("http://localhost:3000");
