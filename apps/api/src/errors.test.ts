import { describe, expect, it } from "vitest";
import { describeError, isUniqueViolation } from "./errors";

const SENSITIVE = "alice.secret@example.com";

/** Shaped like DrizzleQueryError wrapping a pg DatabaseError, with resident data in the usual places. */
function drizzleLikeError() {
  const pg = Object.assign(
    new Error('duplicate key value violates unique constraint "users_email_unique"'),
    {
      name: "error",
      code: "23505",
      constraint: "users_email_unique",
      detail: `Key (email)=(${SENSITIVE}) already exists.`,
    },
  );
  const wrapped = Object.assign(
    new Error(
      `Failed query: insert into "users" ("email") values ($1) returning "id"\nparams: ${SENSITIVE}`,
      { cause: pg },
    ),
    {
      name: "DrizzleQueryError",
      query: 'insert into "users" ("email") values ($1)',
      params: [SENSITIVE],
    },
  );
  return wrapped;
}

describe("describeError", () => {
  it("keeps the SQL shape, SQLSTATE, and constraint but drops parameters and row values", () => {
    const described = describeError(drizzleLikeError());
    const serialized = JSON.stringify(described);

    expect(serialized).not.toContain(SENSITIVE);
    expect(described).toMatchObject({
      name: "DrizzleQueryError",
      message: 'Failed query: insert into "users" ("email") values ($1) returning "id"',
      cause: { code: "23505", constraint: "users_email_unique" },
    });
    expect(described.cause?.message).toContain("duplicate key value");
    expect(described.stack).toContain("Failed query");
    expect(described.stack).not.toContain(SENSITIVE);
  });

  it("masks values PostgreSQL quotes in its own message", () => {
    const pg = Object.assign(new Error(`invalid input syntax for type uuid: "${SENSITIVE}"`), {
      name: "error",
      code: "22P02",
    });
    const wrapped = new Error(
      `Failed query: select * from "residents" where "id" = $1\nparams: ${SENSITIVE}`,
      { cause: pg },
    );

    const described = describeError(wrapped);
    const serialized = JSON.stringify(described);

    expect(serialized).not.toContain(SENSITIVE);
    expect(described.cause).toMatchObject({
      code: "22P02",
      message: 'invalid input syntax for type uuid: "?"',
    });
    expect(described.cause?.stack).not.toContain(SENSITIVE);
    // Quoted identifiers in the wrapping query text are not database values and stay readable.
    expect(described.message).toContain('"residents"');
  });

  it("does not carry arbitrary properties such as params or detail", () => {
    const described = describeError(drizzleLikeError()) as unknown as Record<string, unknown>;
    expect(described).not.toHaveProperty("params");
    expect(described).not.toHaveProperty("query");
    expect(described.cause).not.toHaveProperty("detail");
  });

  it("handles non-Error throwables", () => {
    expect(describeError("boom")).toEqual({ name: "NonError", message: "boom" });
    expect(describeError(42)).toEqual({ name: "NonError", message: "number" });
  });
});

describe("isUniqueViolation", () => {
  it("finds the SQLSTATE on the error or on its cause chain", () => {
    expect(isUniqueViolation(drizzleLikeError())).toBe(true);
    expect(isUniqueViolation(new Error("x"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
