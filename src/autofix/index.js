import fs from "fs-extra";
import { analyzeDartFile, cleanSource, parseWidgetTree } from "../analyzer/index.js";

// Apply autofixes to a file
export async function applyAutoFixes(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  const diagnostics = await analyzeDartFile(filePath);

  if (diagnostics.length === 0) {
    return { success: true, fixedCount: 0, content };
  }

  // Reload widget tree to get fresh indices
  const cleaned = cleanSource(content);
  const widgets = parseWidgetTree(cleaned, content);

  const fixes = [];

  // Group and sort diagnostics by start index descending so index shifting doesn't break earlier indices
  for (const diag of diagnostics) {
    // Find the widget associated with this diagnostic, if any
    const widget = widgets.find(w => w.line === diag.line && w.col === diag.col);

    if (diag.ruleId === "FLEX_CHILD_VIEWPORT" && widget) {
      // Fix: Wrap in Expanded
      fixes.push({
        start: widget.startIdx,
        end: widget.endIdx + 1,
        replacement: `Expanded(child: ${content.substring(widget.startIdx, widget.endIdx + 1)})`
      });
    } 
    else if (diag.ruleId === "NESTED_VIEWPORTS" && widget) {
      // Fix: Add shrinkWrap: true and physics: const NeverScrollableScrollPhysics()
      // Insert right after open parenthesis
      fixes.push({
        start: widget.openParenIdx + 1,
        end: widget.openParenIdx + 1,
        replacement: `\nshrinkWrap: true,\nphysics: const NeverScrollableScrollPhysics(),\n`
      });
    }
    else if (diag.ruleId === "TEXT_OVERFLOW_IN_FLEX" && widget) {
      // Fix: Add overflow: TextOverflow.ellipsis
      // If there are arguments, append it, else just add it
      const hasArgs = (widget.endIdx - widget.openParenIdx) > 2;
      const separator = hasArgs ? ", " : "";
      fixes.push({
        start: widget.endIdx,
        end: widget.endIdx,
        replacement: `${separator}overflow: TextOverflow.ellipsis`
      });
    }
    else if (diag.ruleId === "FORCE_UNWRAP") {
      // Fix force unwrap. We need to find the exact character index from line/col
      const charIdx = getIndexFromLineCol(content, diag.line, diag.col);
      if (charIdx !== -1 && content[charIdx] === "!") {
        // Find variable name before the !
        // e.g., 'value!' or 'map["key"]!'
        // Replace with fallback based on variable name guess
        const preText = content.substring(0, charIdx);
        const varMatch = preText.match(/(\w+|['"\]\)]+)$/);
        const varName = varMatch ? varMatch[1] : "";

        let fallback = "defaultValue";
        if (/name|title|text|id|desc|phone|email/i.test(varName)) {
          fallback = "''";
        } else if (/count|amount|price|index|height|width/i.test(varName)) {
          fallback = "0";
        } else if (/active|has|enabled|visible/i.test(varName)) {
          fallback = "false";
        }

        fixes.push({
          start: charIdx,
          end: charIdx + 1,
          replacement: ` ?? ${fallback}`
        });
      }
    }
    else if (diag.ruleId === "UNSAFE_CAST") {
      // Fix: Replace 'value as Type' with safe cast check
      const charIdx = getIndexFromLineCol(content, diag.line, diag.col);
      if (charIdx !== -1) {
        // Match the 'as Type' pattern
        const remainingText = content.substring(charIdx);
        const castMatch = remainingText.match(/^as\s+([A-Z]\w*(?:<[^>]+>)?)/);
        if (castMatch) {
          const type = castMatch[1];
          const fullCastString = castMatch[0];
          // Find the expression being cast before the index
          const preText = content.substring(0, charIdx);
          const exprMatch = preText.match(/([a-zA-Z0-9_\.\[\]'"\(\)]+)\s*$/);
          if (exprMatch) {
            const expr = exprMatch[1].trim();
            let fallback = "null";
            if (type === "String") fallback = "''";
            else if (type === "int") fallback = "0";
            else if (type === "double") fallback = "0.0";
            else if (type === "bool") fallback = "false";
            else if (type.startsWith("Map")) fallback = "{}";
            else if (type.startsWith("List")) fallback = "[]";

            fixes.push({
              start: charIdx - exprMatch[0].length,
              end: charIdx + fullCastString.length,
              replacement: `(${expr} is ${type} ? ${expr} : ${fallback})`
            });
          }
        }
      }
    }
    else if (diag.ruleId === "MISSING_CONST_CONSTRUCTOR" && widget) {
      // Fix: Prepend const keyword
      fixes.push({
        start: widget.startIdx,
        end: widget.startIdx,
        replacement: "const "
      });
    }
    else if (diag.ruleId === "MISSING_WIDGET_KEY") {
      // Fix: Append {super.key} or super.key to the constructor
      const charIdx = getIndexFromLineCol(content, diag.line, diag.col);
      if (charIdx !== -1) {
        const remainingText = content.substring(charIdx);
        const emptyMatch = remainingText.match(/^([a-zA-Z]\w*)\s*\(\s*\)/);
        if (emptyMatch) {
          fixes.push({
            start: charIdx + emptyMatch[1].length,
            end: charIdx + emptyMatch[0].length,
            replacement: "({super.key})"
          });
        } else {
          const namedMatch = remainingText.match(/^([a-zA-Z]\w*)\s*\(\s*\{/);
          if (namedMatch) {
            fixes.push({
              start: charIdx + namedMatch[0].length,
              end: charIdx + namedMatch[0].length,
              replacement: "super.key, "
            });
          }
        }
      }
    }
    else if (diag.ruleId === "UNDISPOSED_CONTROLLER") {
      // Fix: Inject controller.dispose() call into the dispose() method
      const controllerMatch = diag.message.match(/Controller '(\w+)'/);
      if (controllerMatch) {
        const controllerName = controllerMatch[1];
        const disposeIdx = content.indexOf("void dispose()");
        if (disposeIdx !== -1) {
          const superDisposeIdx = content.indexOf("super.dispose();", disposeIdx);
          if (superDisposeIdx !== -1) {
            fixes.push({
              start: superDisposeIdx,
              end: superDisposeIdx,
              replacement: `${controllerName}.dispose();\n    `
            });
          }
        }
      }
    }
  }

  // Sort fixes by start index descending
  fixes.sort((a, b) => b.start - a.start);

  // Apply fixes sequentially
  let newContent = content;
  let fixedCount = 0;
  for (const fix of fixes) {
    // Avoid double fixing overlapping ranges
    newContent = newContent.substring(0, fix.start) + fix.replacement + newContent.substring(fix.end);
    fixedCount++;
  }

  await fs.writeFile(filePath, newContent, "utf8");

  return { success: true, fixedCount, content: newContent };
}

function getIndexFromLineCol(source, line, col) {
  let curLine = 1;
  let curCol = 1;
  for (let i = 0; i < source.length; i++) {
    if (curLine === line && curCol === col) {
      return i;
    }
    if (source[i] === "\n") {
      curLine++;
      curCol = 1;
    } else {
      curCol++;
    }
  }
  return -1;
}
