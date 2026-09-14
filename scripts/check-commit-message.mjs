// commit-msg hook: validate the subject line of the message being committed.
import { readFileSync } from "node:fs";
import { checkSubject } from "./commit-message-rule.mjs";

const file = process.argv[2];
if (!file) {
  console.error("usage: check-commit-message.mjs <commit-message-file>");
  process.exit(2);
}

const subject =
  readFileSync(file, "utf8")
    .split("\n")
    .find((line) => line.trim() !== "" && !line.startsWith("#")) ?? "";

const problem = checkSubject(subject);
if (problem) {
  console.error(`Commit subject ${problem}:\n\n  ${subject}\n`);
  console.error("Example:  feat(api): add readiness endpoint");
  process.exit(1);
}
