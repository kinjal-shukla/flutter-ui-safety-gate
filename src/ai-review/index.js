import { OpenAI } from "openai";
import fs from "fs-extra";
import path from "path";
import { glob } from "glob";

/**
 * Reviews a single Dart/Flutter file using OpenRouter.
 * @param {string} filePath - Absolute or relative path to the file.
 * @param {string} fileContent - Contents of the file.
 * @returns {Promise<string>} The markdown formatted AI review.
 */
export async function reviewCodeWithAI(filePath, fileContent) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY environment variable. Please set it before running the AI review.");
  }

  const model = process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet";
  const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: apiKey,
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/mcp-demo/flutter-ui-safety-gate",
      "X-Title": "Flutter UI Safety Gate MCP Server"
    }
  });

  const systemPrompt = `You are an expert Flutter and Dart code reviewer. Your job is to analyze the provided Dart code and identify layout bugs, type safety/null-safety violations, and general code smells.
Specifically, look for:
1. Flutter Layout Risks:
   - Unbounded viewports (e.g., ListView, GridView inside Row/Column/Flex without Expanded/Flexible wrapping or shrinkWrap: true).
   - ParentDataWidget errors (e.g., Expanded or Flexible used outside Row, Column, or Flex containers).
   - Text overflow risk (Text or RichText directly inside Row/Flex without wrapping in Expanded/Flexible or having TextOverflow styling).
   - Nested scrollable widgets without shrinkWrap: true and NeverScrollableScrollPhysics.
   - Hardcoded sizes (e.g., absolute width/height > 320) that could cause rendering/overflow issues.
2. Null Safety and Type Cast Risks:
   - Unsafe null assertions (force-unwrap '!') that might crash at runtime.
   - Unsafe casts ('as') that could fail and throw TypeErrors.
   - Uninitialized 'late' variables which might be accessed before assignment.

Provide your review in a highly structured, scannable format:
1. **Summary Table**: Display all issues in a clean Markdown table with columns:
   | Line | Severity | Category | Issue Description | Quick Fix |
   Use emojis for Severity: 🔴 Blocker, 🟡 Warning, 🔵 Info.
2. **Detailed Fixes**: For each blocker/warning, provide a clean code diff/snippet showing the "// BAD" vs "// FIX" implementation.`;

  const userPrompt = `Please review the Dart file: "${path.basename(filePath)}"

File path: ${filePath}
Code content:
\`\`\`dart
${fileContent}
\`\`\`
`;

  const response = await openai.chat.completions.create({
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
  });

  if (!response || !response.choices || response.choices.length === 0) {
    if (response && response.error) {
      throw new Error(`OpenRouter API Error: ${response.error.message || JSON.stringify(response.error)}`);
    }
    throw new Error(`Invalid response format from OpenRouter: ${JSON.stringify(response)}`);
  }

  return response.choices[0].message.content;
}

/**
 * Recursively finds and reviews Dart files in a directory using OpenRouter.
 * @param {string} projectPath - Path to the project root.
 * @returns {Promise<string>} The markdown formatted consolidated project review.
 */
export async function reviewProjectWithAI(projectPath) {
  const resolvedDir = path.resolve(projectPath);
  
  // Find all Dart files recursively, ignoring common generated/ignored dirs
  const files = await glob("**/*.dart", {
    cwd: resolvedDir,
    absolute: true,
    ignore: [
      "**/node_modules/**",
      "**/.git/**",
      "**/build/**",
      "**/.dart_tool/**",
      "**/*.g.dart",
      "**/*.freezed.dart"
    ]
  });

  if (files.length === 0) {
    return "No Dart files found in the project directory.";
  }

  // To prevent rate limits/timeouts, limit the review to key/first 10 files
  const maxFiles = 10;
  const filesToReview = files.slice(0, maxFiles);

  let fullReport = `# Project AI Code Review Report\n`;
  fullReport += `Scanned project directory: \`${projectPath}\`\n`;
  fullReport += `Found ${files.length} Dart files. Reviewing the first ${filesToReview.length} files...\n\n`;

  for (const file of filesToReview) {
    const relativePath = path.relative(resolvedDir, file);
    fullReport += `## File: ${relativePath}\n\n`;
    try {
      const content = await fs.readFile(file, "utf8");
      const review = await reviewCodeWithAI(file, content);
      fullReport += `${review}\n\n---\n\n`;
    } catch (err) {
      fullReport += `❌ Error reviewing file: ${err.message}\n\n---\n\n`;
    }
  }

  if (files.length > maxFiles) {
    fullReport += `*Note: The project contains ${files.length - maxFiles} more Dart files that were skipped to stay within request/token limits.*`;
  }

  return fullReport;
}
