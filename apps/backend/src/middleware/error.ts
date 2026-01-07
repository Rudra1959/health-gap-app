import type { Context } from "hono";

export function errorMiddleware(err: Error, c: Context) {
  console.error("❌ Error:", err);

  return c.json(
    {
      error: "Internal Server Error",
      message: err.message || "Unexpected error",
      path: c.req.path,
    },
    500
  );
}
