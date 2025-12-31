import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { config } from "../config";

interface ErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
  timestamp: string;
  path?: string;
}

export async function errorMiddleware(err: Error, c: Context): Promise<Response> {
  const timestamp = new Date().toISOString();
  const path = c.req.path;

  if (err instanceof ZodError) {
    const response: ErrorResponse = {
      error: "Validation Error",
      message: "Invalid request data",
      details: err.errors.map(e => ({
        field: e.path.join("."),
        message: e.message,
        code: e.code,
      })),
      timestamp,
      path,
    };
    return c.json(response, 400);
  }

  if (err instanceof HTTPException) {
    const response: ErrorResponse = {
      error: err.message,
      timestamp,
      path,
    };
    
    if (err.cause) {
      response.details = err.cause;
    }
    
    return c.json(response, err.status);
  }

  if (config.NODE_ENV === "production") {
    const response: ErrorResponse = {
      error: "Internal Server Error",
      message: "An unexpected error occurred",
      timestamp,
      path,
    };
    return c.json(response, 500);
  }

  const response: ErrorResponse = {
    error: "Internal Server Error",
    message: err.message,
    details: err.stack,
    timestamp,
    path,
  };
  
  return c.json(response, 500);
}
