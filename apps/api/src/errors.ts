import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "./deps";
import { logger } from "./observability";

export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** PostgreSQL unique_violation, possibly wrapped by Drizzle. */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (code === "23505") return true;
  return isUniqueViolation((error as { cause?: unknown }).cause);
}

export const errorHandler: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof HttpError) {
    return c.json({ code: error.code, message: error.message }, error.status);
  }
  if (error instanceof HTTPException) {
    return error.getResponse();
  }
  logger.error({ err: error, requestId: c.get("requestId") }, "unhandled error");
  return c.json({ code: "internal_error", message: "Unexpected error" }, 500);
};
