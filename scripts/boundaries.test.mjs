import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RULES, violations } from "./lib/boundaries.mjs";

const web = RULES.find((r) => r.root === "apps/web/src");
const api = RULES.find((r) => r.root === "apps/api/src");
const specifiers = (file, source, rule) => violations(file, source, rule).map((v) => v.specifier);

describe("boundary scanner", () => {
  it("allows type-only imports from the api in the web app, in both syntaxes", () => {
    const file = "apps/web/src/lib/api.ts";
    assert.deepEqual(specifiers(file, 'import type { AppType } from "@parking/api";', web), []);
    assert.deepEqual(specifiers(file, 'import { type AppType } from "@parking/api";', web), []);
    assert.deepEqual(specifiers(file, 'export type { AppType } from "@parking/api";', web), []);
  });

  it("rejects runtime imports from the api in the web app, static or dynamic", () => {
    const file = "apps/web/src/lib/api.ts";
    assert.deepEqual(specifiers(file, 'import { createApp } from "@parking/api";', web), [
      "@parking/api",
    ]);
    assert.deepEqual(specifiers(file, 'import { type AppType, hc } from "@parking/api";', web), [
      "@parking/api",
    ]);
    assert.deepEqual(specifiers(file, 'const api = await import("@parking/api");', web), [
      "@parking/api",
    ]);
    assert.deepEqual(specifiers(file, 'const db = require("@parking/db");', web), ["@parking/db"]);
  });

  it("sees a statement that does not start its line", () => {
    const source = 'setup(); import { schema } from "@parking/db";';
    assert.deepEqual(specifiers("apps/web/src/main.tsx", source, web), ["@parking/db"]);
  });

  it("allows deep relative imports that stay inside the package", () => {
    const file = "apps/api/src/admin/cycles/list.ts";
    assert.deepEqual(specifiers(file, 'import { validate } from "../../validation";', api), []);
    assert.deepEqual(specifiers(file, 'import { x } from "../../../src/deps";', api), []);
  });

  it("rejects relative imports that leave the package", () => {
    const file = "apps/api/src/admin/draw.ts";
    const source = 'import { schema } from "../../../../packages/db/src/schema";';
    assert.deepEqual(specifiers(file, source, api), ["../../../../packages/db/src/schema"]);
    assert.deepEqual(specifiers("apps/api/src/index.ts", 'import "../../web/src/main";', api), [
      "../../web/src/main",
    ]);
  });

  it("ignores third-party and side-effect imports", () => {
    const source = 'import { Hono } from "hono";\nimport "./polyfill";\nexport * from "./routes";';
    assert.deepEqual(specifiers("apps/api/src/app.ts", source, api), []);
  });
});
