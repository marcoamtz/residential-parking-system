// Root `prepare` script. Installs the lefthook Git hooks when this is a Git checkout and not CI;
// a no-op in CI and inside container image builds, where there is no .git directory.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

if (process.env.CI || !existsSync(".git")) {
  console.log("hooks: skipped (CI or no .git directory)");
} else {
  execSync("lefthook install", { stdio: "inherit" });
}
