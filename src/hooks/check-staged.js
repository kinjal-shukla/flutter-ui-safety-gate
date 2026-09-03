#!/usr/bin/env node
/**
 * Flutter UI Safety Gate — Pre-commit staged file checker
 * Called by the global git pre-commit hook.
 * Runs directly via Node.js — no AI tool or API key required.
 */

import { execSync } from "child_process";
import path from "path";
import { analyzeDartFile } from "../analyzer/index.js";

const projectPath = process.argv[2] || process.cwd();

function git(command) {
  return execSync(`git ${command}`, { cwd: projectPath }).toString().trim();
}

async function main() {
  // 1. Verify this is actually a git repository
  try {
    git("rev-parse --git-dir");
  } catch {
    console.error("Flutter Safety Gate: Not a git repository. Skipping.");
    process.exit(0);
  }

  // 2. Get current branch name for logging
  let branch = "unknown";
  try {
    branch = git("rev-parse --abbrev-ref HEAD");
  } catch {
    // non-fatal — continue without branch name
  }

  // 3. Get staged dart files (added, copied, modified, renamed — exclude deleted)
  let stdout = "";
  try {
    stdout = git("diff --cached --name-only --diff-filter=ACMR");
  } catch (err) {
    console.error("Flutter Safety Gate: Failed to get staged files.", err.message);
    process.exit(0); // Don't block commit if git command fails
  }

  const stagedFiles = stdout
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f.endsWith(".dart"))
    .map((f) => path.join(projectPath, f));

  if (stagedFiles.length === 0) {
    console.log(`Flutter Safety Gate [${branch}]: No staged Dart files. Skipping check.`);
    process.exit(0);
  }

  console.log(`\nFlutter Safety Gate [${branch}]: Checking ${stagedFiles.length} staged Dart file(s)...\n`);

  let hasBlockers = false;
  const results = [];

  for (const file of stagedFiles) {
    try {
      const diagnostics = await analyzeDartFile(file);
      const blockers = diagnostics.filter((d) => d.severity === "blocker");
      const warnings = diagnostics.filter((d) => d.severity !== "blocker");

      if (blockers.length > 0 || warnings.length > 0) {
        if (blockers.length > 0) hasBlockers = true;
        results.push({ file, blockers, warnings });
      }
    } catch (err) {
      console.warn(`  [SKIP] Could not analyze ${file}: ${err.message}`);
    }
  }

  // 4. Print results
  for (const { file, blockers, warnings } of results) {
    const relativePath = path.relative(projectPath, file);
    console.log(`File: ${relativePath}`);

    for (const b of blockers) {
      console.error(`  [BLOCKER] Line ${b.line}: ${b.message}`);
    }
    for (const w of warnings) {
      console.warn(`  [WARNING] Line ${w.line}: ${w.message}`);
    }
    console.log("");
  }

  if (hasBlockers) {
    console.error(`Flutter Safety Gate [${branch}]: COMMIT BLOCKED — fix blocker issues above before committing.\n`);
    process.exit(1);
  } else {
    console.log(`Flutter Safety Gate [${branch}]: All checks passed. Proceeding with commit.\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Flutter Safety Gate: Unexpected error:", err.message);
  process.exit(0); // Don't block commit on unexpected errors
});
