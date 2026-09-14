// CI: validate every commit subject in a range, so skipping the local hook cannot bypass the rule.
//   node scripts/check-commit-range.mjs origin/main..HEAD
import { execFileSync } from "node:child_process";
import { checkSubject } from "./commit-message-rule.mjs";

const range = process.argv[2];
if (!range) {
  console.error("usage: check-commit-range.mjs <git-range>");
  process.exit(2);
}

const lines = execFileSync("git", ["log", "--format=%h%x09%s", range], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

let failures = 0;
for (const line of lines) {
  const [sha, ...rest] = line.split("\t");
  const subject = rest.join("\t");
  const problem = checkSubject(subject);
  if (problem) {
    failures += 1;
    console.error(`${sha}: subject ${problem}\n    ${subject}`);
  }
}

console.log(`${lines.length} commit(s) checked, ${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);
