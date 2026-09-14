// Package boundary check (ADR-0001). pnpm's strict resolution stops undeclared imports; this
// stops the two things it cannot: relative imports that reach into another package, and runtime
// imports from a package a consumer may only use for types.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RULES = [
  {
    root: "packages/domain/src",
    forbid: [/^@parking\//, /^\.\.\/\.\.\//],
    reason: "the domain imports nothing from the workspace",
  },
  {
    root: "packages/db/src",
    forbid: [/^@parking\/(api|web|domain)/, /^\.\.\/\.\.\//],
    reason: "db depends on drizzle and pg only",
  },
  {
    root: "apps/api/src",
    forbid: [/^@parking\/web/, /^\.\.\/\.\.\//],
    reason: "the api never imports the web app or reaches across packages by path",
  },
  {
    root: "apps/web/src",
    forbid: [/^@parking\/(db|domain)/, /^\.\.\/\.\.\//],
    forbidRuntime: [/^@parking\/api/],
    reason: "the web app imports only the api's route types",
  },
];

const IMPORT = /^\s*(import|export)\s+(type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(ts|tsx|mts)$/.test(entry)) yield path;
  }
}

let problems = 0;
for (const rule of RULES) {
  for (const file of files(rule.root)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT)) {
      const [, , typeOnly, specifier] = match;
      const bad =
        rule.forbid.some((re) => re.test(specifier)) ||
        (!typeOnly && (rule.forbidRuntime ?? []).some((re) => re.test(specifier)));
      if (bad) {
        problems += 1;
        console.error(`${relative(".", file)}: imports "${specifier}" (${rule.reason})`);
      }
    }
  }
}

console.log(problems === 0 ? "package boundaries hold" : `${problems} boundary violation(s)`);
process.exit(problems === 0 ? 0 : 1);
