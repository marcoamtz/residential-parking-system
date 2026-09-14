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

export interface ErrorDescription {
  name: string;
  message: string;
  /** PostgreSQL SQLSTATE when the cause is a database error. */
  code?: string;
  constraint?: string;
  /** Stack with the original message replaced by the sanitized one. */
  stack?: string;
  cause?: ErrorDescription;
}

/** PostgreSQL SQLSTATE: five characters, digits and upper-case letters. */
const SQLSTATE = /^[0-9A-Z]{5}$/;

/**
 * What an error is allowed to look like in a log line. Drizzle puts the bound parameters in the
 * message and on `.params`; PostgreSQL puts row values in `detail` and quotes offending values in
 * its message (`invalid input syntax for type uuid: "..."`). All three are dropped: the SQL text
 * with its placeholders, the SQLSTATE, and the constraint name are enough to debug, and resident
 * data must never reach the logs (ADR-0008). Every log site that receives an error uses this,
 * not only the HTTP error handler.
 */
export function describeError(error: unknown, depth = 0): ErrorDescription {
  if (!(error instanceof Error)) {
    return { name: "NonError", message: typeof error === "string" ? error : String(typeof error) };
  }
  const code = (error as { code?: unknown }).code;
  let message = error.message.split(/\r?\nparams:/i)[0]?.trim() ?? "";
  // A database error quotes identifiers and values alike; the constraint name survives in its own
  // field and the statement text in the wrapping error, so nothing debuggable is lost.
  if (typeof code === "string" && SQLSTATE.test(code)) message = message.replace(/"[^"]*"/g, '"?"');
  const description: ErrorDescription = { name: error.name, message };
  if (typeof code === "string") description.code = code;
  const constraint = (error as { constraint?: unknown }).constraint;
  if (typeof constraint === "string") description.constraint = constraint;
  if (error.stack) description.stack = error.stack.replace(error.message, message);
  if (error.cause instanceof Error && depth < 3) {
    description.cause = describeError(error.cause, depth + 1);
  }
  return description;
}

const CODES: Partial<Record<number, string>> = {
  400: "bad_request",
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  413: "payload_too_large",
  415: "unsupported_media_type",
  429: "too_many_requests",
};

export const errorHandler: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof HttpError) {
    return c.json({ code: error.code, message: error.message }, error.status);
  }
  if (error instanceof HTTPException) {
    // Framework errors (malformed JSON body, oversized payload) follow the same { code, message } contract.
    const status = error.status as ContentfulStatusCode;
    const message = error.message || error.getResponse().statusText || "Request failed";
    return c.json({ code: CODES[status] ?? "request_failed", message }, status);
  }
  logger.error({ err: describeError(error), requestId: c.get("requestId") }, "unhandled error");
  return c.json({ code: "internal_error", message: "Unexpected error" }, 500);
};
