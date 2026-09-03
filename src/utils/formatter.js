import path from "path";

// Color codes for ANSI terminal
const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m"
};

function wrapText(text, limit) {
  const paragraphs = text.split("\n");
  const lines = [];

  for (const para of paragraphs) {
    const words = para.split(" ");
    let currentLine = "";

    for (const word of words) {
      if ((currentLine + word).length > limit) {
        if (currentLine) {
          lines.push(currentLine.trim());
        }
        currentLine = word + " ";
      } else {
        currentLine += word + " ";
      }
    }
    if (currentLine) {
      lines.push(currentLine.trim());
    }
  }
  return lines;
}

export function formatConsole(diagnostics) {
  if (diagnostics.length === 0) {
    return `${COLORS.green}✨ No layout or type-safety issues found! Your code is fully guarded. ${COLORS.reset}\n`;
  }

  let output = "";
  let blockersCount = 0;
  let warningsCount = 0;

  // Group by file
  const filesMap = {};
  for (const diag of diagnostics) {
    const relativeFile = path.relative(process.cwd(), diag.file);
    if (!filesMap[relativeFile]) filesMap[relativeFile] = [];
    filesMap[relativeFile].push(diag);
  }

  const COL_LINE = 10;
  const COL_SEV = 11;
  const COL_CAT = 17;
  const COL_MSG = 50;
  const COL_SNIP = 25;

  const padStr = (str, len) => {
    const cleanStr = str.replace(/\x1b\[[0-9;]*m/g, "");
    if (cleanStr.length > len) {
      return cleanStr.substring(0, len - 3) + "...";
    }
    return str + " ".repeat(len - cleanStr.length);
  };

  const drawBorder = (type) => {
    const chars = {
      top:    { left: "┌", mid: "┬", right: "┐", line: "─" },
      middle: { left: "├", mid: "┼", right: "┤", line: "─" },
      bottom: { left: "└", mid: "┴", right: "┘", line: "─" }
    }[type];

    return chars.left + 
      chars.line.repeat(COL_LINE) + chars.mid +
      chars.line.repeat(COL_SEV) + chars.mid +
      chars.line.repeat(COL_CAT) + chars.mid +
      chars.line.repeat(COL_MSG) + chars.mid +
      chars.line.repeat(COL_SNIP) + chars.right + "\n";
  };

  for (const [file, fileDiags] of Object.entries(filesMap)) {
    output += `\n📂 ${COLORS.bold}${file}${COLORS.reset}\n`;
    output += drawBorder("top");
    output += `│ ${COLORS.bold}${padStr("Location", COL_LINE - 1)}${COLORS.reset}│ ${COLORS.bold}${padStr("Severity", COL_SEV - 1)}${COLORS.reset}│ ${COLORS.bold}${padStr("Category", COL_CAT - 1)}${COLORS.reset}│ ${COLORS.bold}${padStr("Issue Description & Recommendation", COL_MSG - 1)}${COLORS.reset}│ ${COLORS.bold}${padStr("Code Snippet", COL_SNIP - 1)}${COLORS.reset}│\n`;
    output += drawBorder("middle");

    for (const d of fileDiags) {
      const isBlocker = d.severity === "BLOCKER";
      if (isBlocker) blockersCount++;
      else warningsCount++;

      const severityColor = isBlocker ? COLORS.red : COLORS.yellow;
      const label = isBlocker ? "BLOCKER" : "WARNING";

      const lineColStr = `L${d.line}:${d.col}`;
      const sevStr = `${severityColor}${COLORS.bold}${label}${COLORS.reset}`;
      const catStr = d.category;
      
      const fullMsg = `Problem: ${d.message}\nFix: ${d.recommendation}`;
      const rawSnippet = d.snippet || "";

      const msgLines = wrapText(fullMsg, COL_MSG - 2);
      const snipLines = wrapText(rawSnippet, COL_SNIP - 2);

      const maxLines = Math.max(msgLines.length, snipLines.length);

      for (let i = 0; i < maxLines; i++) {
        const lineVal = i === 0 ? lineColStr : "";
        const sevVal = i === 0 ? sevStr : "";
        const catVal = i === 0 ? catStr : "";
        const msgVal = msgLines[i] || "";
        const snipVal = snipLines[i] || "";

        output += `│ ${padStr(lineVal, COL_LINE - 1)}│ ${padStr(sevVal, COL_SEV - 1)}│ ${padStr(catVal, COL_CAT - 1)}│ ${padStr(msgVal, COL_MSG - 1)}│ ${padStr(snipVal ? COLORS.cyan + snipVal + COLORS.reset : "", COL_SNIP - 1)}│\n`;
      }
      
      if (fileDiags.indexOf(d) < fileDiags.length - 1) {
        output += drawBorder("middle");
      }
    }
    output += drawBorder("bottom");
  }

  output += `📊 ${COLORS.bold}Summary:${COLORS.reset} Found ${COLORS.red}${COLORS.bold}${blockersCount} blocker(s)${COLORS.reset} and ${COLORS.yellow}${COLORS.bold}${warningsCount} warning(s)${COLORS.reset}.\n`;

  if (blockersCount > 0) {
    output += `${COLORS.red}${COLORS.bold}❌ ACTION REQUIRED: Critical issues must be resolved before committing code.${COLORS.reset}\n`;
  } else {
    output += `${COLORS.green}✅ Checks passed with warnings. Code is committable.${COLORS.reset}\n`;
  }

  return output;
}

export function formatMarkdown(diagnostics, projectName = "Flutter Project") {
  const total = diagnostics.length;
  const blockers = diagnostics.filter(d => d.severity === "BLOCKER").length;
  const warnings = diagnostics.filter(d => d.severity === "WARNING").length;

  // Calculate Health Index
  let healthScore = 100 - (blockers * 15) - (warnings * 5);
  healthScore = Math.max(0, Math.min(100, healthScore));

  let healthStatus = "Excellent 🟢";
  if (healthScore < 70) {
    healthStatus = "High Risk 🔴";
  } else if (healthScore < 90) {
    healthStatus = "Needs Attention 🟡";
  }

  let md = `# Flutter Layout Guard Report: ${projectName}\n\n`;
  md += `## Project Health: **${healthScore}/100** (${healthStatus})\n\n`;

  md += `### Summary metrics:\n`;
  md += `- **Total Issues**: ${total}\n`;
  md += `- **Blocker Issues**: ${blockers} (must be resolved to commit)\n`;
  md += `- **Warning Issues**: ${warnings}\n\n`;

  if (total === 0) {
    md += `> [!NOTE]\n`;
    md += `> **✨ All checks passed!** No layout or type-safety issues found. The codebase is clean.\n`;
    return md;
  }

  md += `## Detailed Diagnostics\n\n`;

  // Group by file
  const filesMap = {};
  for (const diag of diagnostics) {
    const relativeFile = path.relative(process.cwd(), diag.file);
    if (!filesMap[relativeFile]) filesMap[relativeFile] = [];
    filesMap[relativeFile].push(diag);
  }

  for (const [file, fileDiags] of Object.entries(filesMap)) {
    md += `### File: \`${file}\`\n\n`;
    md += `| Line:Col | Severity | Category | Description / Fix | \n`;
    md += `| --- | --- | --- | --- |\n`;

    for (const d of fileDiags) {
      const sevBadge = d.severity === "BLOCKER" ? "🚫 **BLOCKER**" : "⚠️ WARNING";
      const cleanedMessage = d.message.replace(/\|/g, "\\|");
      const cleanedRec = d.recommendation.replace(/\|/g, "\\|");

      md += `| \`L${d.line}:${d.col}\` | ${sevBadge} | \`${d.category}\` | **Problem:** ${cleanedMessage}<br> **Fix:** ${cleanedRec} | \n`;
    }
    md += `\n`;
  }

  return md;
}

export function formatJSON(diagnostics) {
  const blockers = diagnostics.filter(d => d.severity === "BLOCKER").length;
  const warnings = diagnostics.filter(d => d.severity === "WARNING").length;

  return JSON.stringify({
    success: blockers === 0,
    metrics: {
      total: diagnostics.length,
      blockers,
      warnings
    },
    diagnostics: diagnostics.map(d => ({
      ruleId: d.ruleId,
      severity: d.severity,
      category: d.category,
      file: d.file,
      line: d.line,
      col: d.col,
      message: d.message,
      snippet: d.snippet,
      recommendation: d.recommendation
    }))
  }, null, 2);
}
