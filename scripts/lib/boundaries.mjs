// Package boundary rules and the import scanner behind `pnpm check:boundaries` (ADR-0001).
// pnpm's strict resolution stops undeclared packages; this stops the two things it cannot:
// relative imports that leave the package, and runtime imports from a package a consumer may
// only use for types. Static, dynamic (`import()`), and `require()` specifiers are all scanned.
import { dirname, resolve, sep } from "node:path";

export const RULES = [
  {
    root: "packages/domain/src",
    forbid: [/^@parking\//],
    reason: "the domain imports nothing from the workspace",
  },
  {
    root: "packages/db/src",
    forbid: [/^@parking\/(api|web|domain)/],
    reason: "db depends on drizzle and pg only",
  },
  {
    root: "apps/api/src",
    forbid: [/^@parking\/web/],
    reason: "the api never imports the web app or reaches across packages by path",
  },
  {
    root: "apps/web/src",
    forbid: [/^@parking\/(db|domain)/],
    forbidRuntime: [/^@parking\/api/],
    reason: "the web app imports only the api's route types",
  },
];

// `import x from "m"`, `import { type A, b } from "m"`, `import type { A } from "m"`, `import "m"`,
// `export { a } from "m"`, `export * from "m"`, `export type { A } from "m"`. Not anchored to the
// line start, so a statement after other code on the same line is still seen.
const STATIC = /\b(import|export)\s+(type\s+)?(?:([^'";]*?)\s+from\s+)?['"]([^'"]+)['"]/g;
// `import("m")` and `require("m")`, both runtime by definition.
const DYNAMIC = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
// `{ type A, type B as C }`: every specifier carries the inline `type` modifier.
const INLINE_TYPE_ONLY = /^\{\s*(?:type\s+\w+(?:\s+as\s+\w+)?\s*,?\s*)+\}$/;

/** Every import specifier in `source` with whether it is erased at compile time. */
export function imports(source) {
  const found = [];
  for (const match of source.matchAll(STATIC)) {
    const [, , typeKeyword, clause, specifier] = match;
    const typeOnly =
      Boolean(typeKeyword) || (clause !== undefined && INLINE_TYPE_ONLY.test(clause.trim()));
    found.push({ specifier, typeOnly });
  }
  for (const match of source.matchAll(DYNAMIC)) {
    found.push({ specifier: match[1], typeOnly: false });
  }
  return found;
}

/** Whether a relative specifier, resolved from `file`, stays inside the rule's package root. */
function leavesPackage(file, specifier, root) {
  if (!specifier.startsWith(".")) return false;
  const target = resolve(dirname(file), specifier);
  const base = resolve(root);
  return target !== base && !target.startsWith(base + sep);
}

/** Boundary violations for one file under `rule.root`. */
export function violations(file, source, rule) {
  const problems = [];
  for (const { specifier, typeOnly } of imports(source)) {
    const forbidden =
      rule.forbid.some((re) => re.test(specifier)) ||
      (!typeOnly && (rule.forbidRuntime ?? []).some((re) => re.test(specifier))) ||
      leavesPackage(file, specifier, rule.root);
    if (forbidden) problems.push({ file, specifier, reason: rule.reason });
  }
  return problems;
}
