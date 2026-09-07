import type { MiddlewareHandler } from "hono";
import { HttpError } from "./errors";

export const REQUEST_HEADER = "x-requested-with";
export const REQUEST_HEADER_VALUE = "parking-web";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Second layer against cross-site request forgery, alongside the SameSite=Strict cookie.
 * A browser only attaches a custom header from same-origin script, never from a cross-site form.
 */
export const requireCustomHeader: MiddlewareHandler = async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method) && c.req.header(REQUEST_HEADER) !== REQUEST_HEADER_VALUE) {
    throw new HttpError(403, "missing_request_header", `Mutating requests need ${REQUEST_HEADER}`);
  }
  await next();
};
