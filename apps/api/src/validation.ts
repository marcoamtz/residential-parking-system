import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";

/**
 * Request validation with the same error shape as every other error in the API:
 * `{ code, message }`, plus an `issues` list pointing at the offending fields (docs/03-api.md).
 */
export function validate<T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          code: "validation_error",
          message: `Invalid ${target}`,
          issues: result.error.issues.map((issue) => ({
            path: issue.path.map(String).join("."),
            message: issue.message,
          })),
        },
        400,
      );
    }
  });
}
