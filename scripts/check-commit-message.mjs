// Conventional Commits check for the commit-msg hook. No dependency: one regular expression.
// Format: <type>(<optional scope>)<optional !>: <subject>, subject up to 72 characters.
import { readFileSync } from "node:fs";

const TYPES = [
  "feat",
  "fix",
  "docs",
  "test",
  "build",
  "ci",
  "chore",
  "refactor",
  "perf",
  "style",
  "revert",
];
const PATTERN = new RegExp(`^(${TYPES.join("|")})(\\([a-z0-9][a-z0-9-]*\\))?!?: [^\\s].{0,71}$`);

const file = process.argv[2];
if (!file) {
  console.error("usage: check-commit-message.mjs <commit-message-file>");
  process.exit(2);
}

const subject =
  readFileSync(file, "utf8")
    .split("\n")
    .find((line) => line.trim() !== "" && !line.startsWith("#")) ?? "";

// Git-generated messages are left alone.
if (/^(Merge|Revert|fixup!|squash!) /.test(subject)) process.exit(0);

if (!PATTERN.test(subject)) {
  console.error(`Commit subject does not follow Conventional Commits:\n\n  ${subject}\n`);
  console.error(`Expected: <type>(<scope>)?: <subject>   with type in ${TYPES.join(", ")}`);
  console.error("Example:  feat(api): add readiness endpoint");
  process.exit(1);
}
