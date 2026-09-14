// Conventional Commits rule shared by the commit-msg hook and the CI range check.
// Format: <type>(<optional scope>)<optional !>: <subject>; whole first line up to 72 characters.
export const TYPES = [
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
export const MAX_SUBJECT_LENGTH = 72;

const PATTERN = new RegExp(`^(${TYPES.join("|")})(\\([a-z0-9][a-z0-9-]*\\))?!?: [^\\s].*$`);

/** Git-generated messages are left alone. */
export function isGenerated(subject) {
  return /^(Merge|Revert|fixup!|squash!) /.test(subject);
}

/** Returns null when the subject conforms, otherwise the reason it does not. */
export function checkSubject(subject) {
  if (isGenerated(subject)) return null;
  if (!PATTERN.test(subject)) {
    return `does not match <type>(<scope>)?: <subject> with type in ${TYPES.join(", ")}`;
  }
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return `is ${subject.length} characters; the limit is ${MAX_SUBJECT_LENGTH}`;
  }
  return null;
}
