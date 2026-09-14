// Package boundary check (ADR-0001). Rules and scanner live in ./lib/boundaries.mjs so they can
// be unit-tested (scripts/boundaries.test.mjs); this file walks the tree and reports.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { RULES, violations } from "./lib/boundaries.mjs";

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
    for (const problem of violations(file, readFileSync(file, "utf8"), rule)) {
      problems += 1;
      console.error(
        `${relative(".", problem.file)}: imports "${problem.specifier}" (${problem.reason})`,
      );
    }
  }
}

console.log(problems === 0 ? "package boundaries hold" : `${problems} boundary violation(s)`);
process.exit(problems === 0 ? 0 : 1);
