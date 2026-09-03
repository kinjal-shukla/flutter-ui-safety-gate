import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, ".env") });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fse from "fs-extra";
import { exec } from "child_process";
import { promisify } from "util";

import { analyzeDartFile, analyzeDirectory } from "./src/analyzer/index.js";
import { RULES } from "./src/analyzer/rules.js";
import { applyAutoFixes } from "./src/autofix/index.js";
import { formatMarkdown, formatJSON } from "./src/utils/formatter.js";
import { reviewCodeWithAI, reviewProjectWithAI } from "./src/ai-review/index.js";
import { generateDartClasses } from "./src/utils/generator.js";
import { discoverApiDetails, resolveDetailsFromSwaggerUi } from "./src/utils/docParser.js";

const execAsync = promisify(exec);

const server = new McpServer({
  name: "flutter-ui-safety-gate",
  version: "1.0.0",
});

// ─── TOOL: analyze_file ──────────────────────────────────────────────────────
server.tool(
  "analyze_file",
  "Analyze a single Dart/Flutter file for layout risks (unbounded viewports, invalid Expanded parents) and null safety violations (force-unwraps, unsafe casts).",
  {
    filePath: z.string().describe("Absolute or relative path to the Dart file to analyze"),
  },
  async ({ filePath }) => {
    try {
      const resolvedPath = path.resolve(filePath);
      if (!(await fse.pathExists(resolvedPath))) {
        return {
          content: [{ type: "text", text: `Error: File not found at ${filePath}` }],
          isError: true,
        };
      }

      const diagnostics = await analyzeDartFile(resolvedPath);
      return {
        content: [{ type: "text", text: formatJSON(diagnostics) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Execution failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── TOOL: analyze_project ───────────────────────────────────────────────────
server.tool(
  "analyze_project",
  "Scan an entire Flutter directory for layout and type safety violations, filtering out generated files automatically.",
  {
    projectPath: z.string().optional().default(".").describe("Path to the Flutter project root"),
    excludePaths: z.array(z.string()).optional().describe("Folders/files to exclude from scanning"),
  },
  async ({ projectPath = ".", excludePaths = [] }) => {
    try {
      const resolvedPath = path.resolve(projectPath);
      if (!(await fse.pathExists(resolvedPath))) {
        return {
          content: [{ type: "text", text: `Error: Directory not found at ${projectPath}` }],
          isError: true,
        };
      }

      const diagnostics = await analyzeDirectory(resolvedPath, { excludePaths });
      return {
        content: [{ type: "text", text: formatJSON(diagnostics) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Execution failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── TOOL: check_git_diff ────────────────────────────────────────────────────
server.tool(
  "check_git_diff",
  "Analyze only the staged changes in a git repository to verify if they violate any blocker rules.",
  {
    projectPath: z.string().optional().default(".").describe("Path to the git repository"),
  },
  async ({ projectPath = "." }) => {
    try {
      const resolvedPath = path.resolve(projectPath);
      const gitDir = path.join(resolvedPath, ".git");

      if (!(await fse.pathExists(gitDir))) {
        return {
          content: [{ type: "text", text: `Error: Not a git repository: ${projectPath}` }],
          isError: true,
        };
      }

      // Find staged Dart files
      let stdout;
      try {
        const res = await execAsync("git diff --cached --name-only --diff-filter=d", { cwd: resolvedPath });
        stdout = res.stdout;
      } catch (gitErr) {
        return {
          content: [{ type: "text", text: `Git command failed: ${gitErr.message}. Ensure git is installed and repository is initialized.` }],
          isError: true,
        };
      }

      const stagedFiles = stdout
        .split("\n")
        .map(f => f.trim())
        .filter(f => f.endsWith(".dart"))
        .map(f => path.join(resolvedPath, f));

      if (stagedFiles.length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, message: "No staged Dart files to analyze." }, null, 2) }],
        };
      }

      const diagnostics = [];
      for (const file of stagedFiles) {
        if (await fse.pathExists(file)) {
          const fileDiags = await analyzeDartFile(file);
          diagnostics.push(...fileDiags);
        }
      }

      return {
        content: [{ type: "text", text: formatJSON(diagnostics) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Execution failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── TOOL: auto_fix_issues ───────────────────────────────────────────────────
server.tool(
  "auto_fix_issues",
  "Automatically repair common layout bugs (wrap listviews, add shrinkwrap, Text overflow ellipsis) and replace unsafe casts/assertions with safe fallbacks.",
  {
    filePath: z.string().describe("Path to the Dart file to auto-fix"),
  },
  async ({ filePath }) => {
    try {
      const resolvedPath = path.resolve(filePath);
      if (!(await fse.pathExists(resolvedPath))) {
        return {
          content: [{ type: "text", text: `Error: File not found at ${filePath}` }],
          isError: true,
        };
      }

      const result = await applyAutoFixes(resolvedPath);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, fixedCount: result.fixedCount, filePath }, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Execution failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);



// ─── TOOL: generate_report ───────────────────────────────────────────────────
server.tool(
  "generate_report",
  "Generate a markdown formatted Quality Assurance report including Project Health Index and list of blockers/warnings.",
  {
    projectPath: z.string().optional().default(".").describe("Path to the Flutter project root"),
  },
  async ({ projectPath = "." }) => {
    try {
      const resolvedPath = path.resolve(projectPath);
      if (!(await fse.pathExists(resolvedPath))) {
        return {
          content: [{ type: "text", text: `Error: Directory not found at ${projectPath}` }],
          isError: true,
        };
      }

      const diagnostics = await analyzeDirectory(resolvedPath);
      const mdReport = formatMarkdown(diagnostics, path.basename(resolvedPath));
      return {
        content: [{ type: "text", text: mdReport }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Execution failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── TOOL: ai_review_file ────────────────────────────────────────────────────
server.tool(
  "ai_review_file",
  "Use OpenRouter AI to perform a comprehensive code review of a single Dart/Flutter file for layout risks and null safety violations.",
  {
    filePath: z.string().describe("Absolute or relative path to the Dart file to review"),
  },
  async ({ filePath }) => {
    try {
      const resolvedPath = path.resolve(filePath);
      if (!(await fse.pathExists(resolvedPath))) {
        return {
          content: [{ type: "text", text: `Error: File not found at ${filePath}` }],
          isError: true,
        };
      }

      const content = await fse.readFile(resolvedPath, "utf8");
      const review = await reviewCodeWithAI(resolvedPath, content);
      return {
        content: [{ type: "text", text: review }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Execution failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── TOOL: ai_review_project ─────────────────────────────────────────────────
server.tool(
  "ai_review_project",
  "Use OpenRouter AI to recursively scan and review Dart files in a Flutter project directory.",
  {
    projectPath: z.string().optional().default(".").describe("Path to the Flutter project root"),
  },
  async ({ projectPath = "." }) => {
    try {
      const resolvedPath = path.resolve(projectPath);
      if (!(await fse.pathExists(resolvedPath))) {
        return {
          content: [{ type: "text", text: `Error: Directory not found at ${projectPath}` }],
          isError: true,
        };
      }

      const reviewReport = await reviewProjectWithAI(resolvedPath);
      return {
        content: [{ type: "text", text: reviewReport }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Execution failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── TOOL: generate_model_class ──────────────────────────────────────────────
server.tool(
  "generate_model_class",
  "Generate Dart model classes with fromJson and toJson serialization from a JSON string or API endpoint URL.",
  {
    jsonInput: z.string().describe("The raw JSON string or API endpoint URL to parse"),
    className: z.string().describe("The name of the root Dart class (e.g. UserResponse)"),
    targetPath: z.string().optional().describe("Optional workspace path to save the generated Dart file (e.g. lib/models/user.dart)"),
    method: z.string().optional().default("GET").describe("The HTTP method to use (e.g. GET, POST, PUT)"),
    headers: z.string().optional().describe("JSON string of custom headers to include in the request"),
    body: z.string().optional().describe("JSON string of the request payload body (for POST/PUT)"),
  },
  async ({ jsonInput, className, targetPath, method, headers, body }) => {
    try {
      let jsonObject;
      if (jsonInput.startsWith("http://") || jsonInput.startsWith("https://")) {
        if (jsonInput.includes("#/")) {
          const uiDoc = await resolveDetailsFromSwaggerUi(jsonInput);
          if (uiDoc && uiDoc.mockResponse) {
            jsonObject = uiDoc.mockResponse;
          } else {
            throw new Error(`Failed to extract API schema from Swagger UI page.`);
          }
        } else {
          const apiDoc = await discoverApiDetails(jsonInput);
          
          const finalMethod = (method && method !== "GET") ? method.toUpperCase() : (apiDoc?.method || "GET");
          
          const finalHeaders = {
            ...(apiDoc?.headers || {}),
            ...(headers ? JSON.parse(headers) : {})
          };

          const finalBody = body || apiDoc?.body || null;

          const fetchOptions = {
            method: finalMethod,
            headers: finalHeaders
          };

          if (finalBody) {
            fetchOptions.body = finalBody;
            const hasContentType = Object.keys(fetchOptions.headers).some(
              (k) => k.toLowerCase() === "content-type"
            );
            if (!hasContentType) {
              fetchOptions.headers["Content-Type"] = "application/json";
            }
          }

          try {
            const response = await fetch(jsonInput, fetchOptions);
            if (!response.ok) {
              if (apiDoc?.mockResponse) {
                jsonObject = apiDoc.mockResponse;
              } else {
                throw new Error(`Failed to fetch JSON from API. Status: ${response.status} ${response.statusText}`);
              }
            } else {
              jsonObject = await response.json();
            }
          } catch (fetchErr) {
            if (apiDoc?.mockResponse) {
              jsonObject = apiDoc.mockResponse;
            } else {
              throw fetchErr;
            }
          }
        }
      } else {
        jsonObject = JSON.parse(jsonInput);
      }

      const dartCode = generateDartClasses(jsonObject, className);

      if (targetPath) {
        const resolvedPath = path.resolve(targetPath);
        await fse.outputFile(resolvedPath, dartCode, "utf8");
        return {
          content: [{
            type: "text",
            text: `Successfully generated Dart model classes and saved to ${targetPath}.\n\n\`\`\`dart\n${dartCode}\n\`\`\``
          }]
        };
      }

      return {
        content: [{
          type: "text",
          text: `Successfully generated Dart model classes:\n\n\`\`\`dart\n${dartCode}\n\`\`\``
        }]
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Model generation failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);



// ─── TOOL: setup_global_git_hook ─────────────────────────────────────────────
server.tool(
  "setup_global_git_hook",
  "Install a global git pre-commit hook that automatically runs Flutter UI Safety Gate checks on staged Dart files before every commit, across ALL git projects on this machine. Run this once — no per-project setup needed.",
  {},
  async () => {
    try {
      const os = await import("os");
      const hooksDir = path.join(os.default.homedir(), ".git-hooks");
      const hookFile = path.join(hooksDir, "pre-commit");
      const checkerScript = path.resolve(__dirname, "src", "hooks", "check-staged.js");

      // Create ~/.git-hooks directory
      await fse.ensureDir(hooksDir);

      // Write the pre-commit hook script
      const hookContent = `#!/bin/sh
# Flutter UI Safety Gate — Global Pre-commit Hook
# Auto-installed by flutter-ui-safety-gate MCP
# Runs on every git commit across all projects. No AI tool required.

node "${checkerScript}" "$PWD"
exit $?
`;

      await fse.writeFile(hookFile, hookContent, { encoding: "utf8", mode: 0o755 });

      // Configure git globally to use this hooks directory
      await execAsync(`git config --global core.hooksPath "${hooksDir}"`);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: "Global git pre-commit hook installed successfully!",
                details: {
                  hooksDirectory: hooksDir,
                  hookFile: hookFile,
                  checkerScript: checkerScript,
                  gitConfig: "core.hooksPath set globally",
                  note: "Every git commit on this machine will now automatically check staged Dart files using Flutter UI Safety Gate rules. Works with Claude, Cursor, VS Code, terminal — any tool that runs git.",
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Failed to install git hook: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── RESOURCE: project_rules ─────────────────────────────────────────────────
server.resource(
  "project_rules",
  "flutter-gate://rules",
  {
    mimeType: "application/json",
    name: "Flutter Safety Gate Rules List",
    description: "Exposes the complete list of all 24 layout, performance, and leak checks enforced by the gate.",
  },
  async (uri) => {
    return {
      contents: [
        {
          uri: uri.toString(),
          text: JSON.stringify(RULES, null, 2),
          mimeType: "application/json",
        },
      ],
    };
  }
);

// ─── PROMPT: review_file ─────────────────────────────────────────────────────
server.prompt(
  "review-file",
  {
    description: "Get a layout, style, and safety code review prompt for a specific Dart file.",
    arguments: [
      {
        name: "filePath",
        description: "Path to the Dart file to review",
        required: true,
      },
    ],
  },
  async ({ filePath }) => {
    try {
      const resolvedPath = path.resolve(filePath);
      const code = await fse.readFile(resolvedPath, "utf8");
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Review the following Dart file at "${filePath}" using the Flutter Safety Gate rules. Here is the code:\n\n\`\`\`dart\n${code}\n\`\`\``,
            },
          },
        ],
      };
    } catch (err) {
      throw new Error(`Failed to load file for prompt: ${err.message}`);
    }
  }
);

// ─── SERVER STARTUP ──────────────────────────────────────────────────────────
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Flutter UI Safety Gate MCP server running on STDIO transport");
}

run().catch((err) => {
  console.error("Fatal server error:", err);
  process.exit(1);
});
