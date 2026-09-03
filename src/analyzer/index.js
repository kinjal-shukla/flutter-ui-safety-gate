import fs from "fs-extra";
import path from "path";
import { RULES } from "./rules.js";

// Helper to clean Dart code of comments and strings while keeping indexes intact
export function cleanSource(source) {
  let cleaned = "";
  let i = 0;
  let inSingleComment = false;
  let inMultiComment = false;
  let stringChar = null; // ' or "
  let inTripleString = false;

  while (i < source.length) {
    const char = source[i];
    const nextChar = source[i + 1];

    if (inSingleComment) {
      if (char === '\n' || char === '\r') {
        inSingleComment = false;
        cleaned += char;
      } else {
        cleaned += " ";
      }
      i++;
    } else if (inMultiComment) {
      if (char === '*' && nextChar === '/') {
        inMultiComment = false;
        cleaned += "  ";
        i += 2;
      } else {
        if (char === '\n' || char === '\r') {
          cleaned += char;
        } else {
          cleaned += " ";
        }
        i++;
      }
    } else if (stringChar) {
      if (inTripleString) {
        if (char === stringChar && source[i + 1] === stringChar && source[i + 2] === stringChar) {
          inTripleString = false;
          stringChar = null;
          cleaned += "   ";
          i += 3;
        } else {
          if (char === '\n' || char === '\r') {
            cleaned += char;
          } else {
            cleaned += " ";
          }
          i++;
        }
      } else {
        if (char === '\\') {
          cleaned += "  ";
          i += 2;
        } else if (char === stringChar) {
          stringChar = null;
          cleaned += " ";
          i++;
        } else {
          if (char === '\n' || char === '\r') {
            cleaned += char;
          } else {
            cleaned += " ";
          }
          i++;
        }
      }
    } else {
      if (char === '/' && nextChar === '/') {
        inSingleComment = true;
        cleaned += "  ";
        i += 2;
      } else if (char === '/' && nextChar === '*') {
        inMultiComment = true;
        cleaned += "  ";
        i += 2;
      } else if (char === "'" && nextChar === "'" && source[i + 2] === "'") {
        inTripleString = true;
        stringChar = "'";
        cleaned += "   ";
        i += 3;
      } else if (char === '"' && nextChar === '"' && source[i + 2] === '"') {
        inTripleString = true;
        stringChar = '"';
        cleaned += "   ";
        i += 3;
      } else if (char === "'" || char === '"') {
        stringChar = char;
        cleaned += " ";
        i++;
      } else {
        cleaned += char;
        i++;
      }
    }
  }
  return cleaned;
}

// Find matching closing parenthesis
function findMatchingParen(source, startIdx) {
  let depth = 1;
  for (let i = startIdx; i < source.length; i++) {
    const c = source[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

// Strip nested brackets/parens/braces to find direct properties of a widget
export function getDirectText(widgetText) {
  let result = "";
  let depth = 0;
  for (let i = 0; i < widgetText.length; i++) {
    const char = widgetText[i];
    if (char === '(' || char === '[' || char === '{') {
      if (depth === 0) result += char;
      depth++;
    } else if (char === ')' || char === ']' || char === '}') {
      depth--;
      if (depth === 0) result += char;
    } else {
      if (depth === 0) {
        result += char;
      }
    }
  }
  return result;
}

// Compute line and column from index
function getLineCol(source, idx) {
  let line = 1;
  let col = 1;
  for (let i = 0; i < idx; i++) {
    if (source[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

// Get context snippet for report
function getSnippet(source, lineNum) {
  const lines = source.split("\n");
  const targetLine = lines[lineNum - 1] || "";
  return targetLine.trim();
}

// Parse widgets and build parent-child relations
export function parseWidgetTree(cleanedSource, originalSource) {
  const widgetRegex = /\b([A-Z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)?)\s*\(/g;
  const widgets = [];
  let match;

  while ((match = widgetRegex.exec(cleanedSource)) !== null) {
    const name = match[1];
    const openParenIdx = match.index + match[0].length - 1;
    const closeParenIdx = findMatchingParen(cleanedSource, openParenIdx + 1);

    if (closeParenIdx !== -1) {
      const { line, col } = getLineCol(originalSource, match.index);
      widgets.push({
        name,
        startIdx: match.index,
        endIdx: closeParenIdx,
        openParenIdx,
        line,
        col,
        children: [],
        parent: null,
        directText: ""
      });
    }
  }

  // Sort widgets by startIdx ascending
  widgets.sort((a, b) => a.startIdx - b.startIdx);

  // Link parents and children
  for (let i = 0; i < widgets.length; i++) {
    const child = widgets[i];
    let possibleParent = null;

    for (let j = 0; j < widgets.length; j++) {
      if (i === j) continue;
      const parent = widgets[j];
      // Check if parent encloses child
      if (parent.startIdx < child.startIdx && child.endIdx < parent.endIdx) {
        if (!possibleParent || parent.startIdx > possibleParent.startIdx) {
          possibleParent = parent;
        }
      }
    }

    if (possibleParent) {
      child.parent = possibleParent;
      possibleParent.children.push(child);
    }
  }

  // Populate directText
  for (const widget of widgets) {
    const insideText = cleanedSource.substring(widget.openParenIdx + 1, widget.endIdx);
    widget.directText = getDirectText(insideText);
  }

  return widgets;
}

// Check if widget or any parent is declared with const prefix
function hasConstAncestor(widget, cleaned) {
  let curr = widget;
  while (curr) {
    const prefix = cleaned.substring(Math.max(0, curr.startIdx - 15), curr.startIdx);
    if (/\bconst\s+$/.test(prefix)) {
      return true;
    }
    curr = curr.parent;
  }
  return false;
}

function findMatchingBrace(source, startIdx) {
  let depth = 1;
  for (let i = startIdx; i < source.length; i++) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function parsePubspecAssets(pubspecText) {
  const assets = [];
  const lines = pubspecText.split("\n");
  let inAssetsSection = false;
  
  for (const line of lines) {
    if (/^\s*assets:\s*$/.test(line)) {
      inAssetsSection = true;
      continue;
    }
    if (inAssetsSection) {
      if (line.trim() !== "" && !line.startsWith(" ") && !line.startsWith("-")) {
        inAssetsSection = false;
        continue;
      }
      const match = /^\s*-\s*(.+)$/.exec(line);
      if (match) {
        assets.push(match[1].trim());
      }
    }
  }
  return assets;
}

// Analyze a single file
export async function analyzeDartFile(filePath, options = {}) {
  const { pubspecAssets = [], projectRoot = ".", hasPubspec = false } = options;
  const content = await fs.readFile(filePath, "utf8");
  const cleaned = cleanSource(content);
  const widgets = parseWidgetTree(cleaned, content);
  const diagnostics = [];

  const addDiagnostic = (ruleId, line, col, customMessage = null) => {
    const rule = RULES[ruleId];
    diagnostics.push({
      ruleId,
      severity: rule.severity,
      category: rule.category,
      description: rule.description,
      recommendation: rule.recommendation,
      message: customMessage || rule.description,
      file: filePath,
      line,
      col,
      snippet: getSnippet(content, line)
    });
  };

  const scrollables = ["ListView", "GridView", "SingleChildScrollView", "ListView.builder", "GridView.builder", "ListView.separated"];

  // 1. Run Widget-based Layout Rules
  for (const widget of widgets) {
    // Rule: INVALID_EXPANDED_PARENT
    if (widget.name === "Expanded" || widget.name === "Flexible") {
      if (widget.parent) {
        const parentName = widget.parent.name;
        if (parentName !== "Row" && parentName !== "Column" && parentName !== "Flex") {
          addDiagnostic(
            "INVALID_EXPANDED_PARENT",
            widget.line,
            widget.col,
            `Incorrect use of ParentDataWidget: '${widget.name}' must be a direct child of Row, Column, or Flex (found parent '${parentName}').`
          );
        }
      }
    }

    // Rule: POSITIONED_OUTSIDE_STACK
    if (widget.name === "Positioned") {
      if (widget.parent) {
        const parentName = widget.parent.name;
        if (parentName !== "Stack") {
          addDiagnostic(
            "POSITIONED_OUTSIDE_STACK",
            widget.line,
            widget.col,
            `Incorrect use of ParentDataWidget: '${widget.name}' must be a direct child of Stack (found parent '${parentName}').`
          );
        }
      } else {
        addDiagnostic(
          "POSITIONED_OUTSIDE_STACK",
          widget.line,
          widget.col,
          `Incorrect use of ParentDataWidget: '${widget.name}' must be a direct child of Stack.`
        );
      }
    }

    // Rule: SPACER_OUTSIDE_FLEX
    if (widget.name === "Spacer") {
      if (widget.parent) {
        const parentName = widget.parent.name;
        if (parentName !== "Row" && parentName !== "Column" && parentName !== "Flex") {
          addDiagnostic(
            "SPACER_OUTSIDE_FLEX",
            widget.line,
            widget.col,
            `Incorrect use of ParentDataWidget: '${widget.name}' must be a direct child of Row, Column, or Flex (found parent '${parentName}').`
          );
        }
      } else {
        addDiagnostic(
          "SPACER_OUTSIDE_FLEX",
          widget.line,
          widget.col,
          `Incorrect use of ParentDataWidget: '${widget.name}' must be a direct child of Row, Column, or Flex.`
        );
      }
    }

    // Rule: SPACER_INSIDE_SCROLLVIEW
    if (widget.name === "Spacer") {
      let current = widget.parent;
      let hasScrollViewAncestor = false;
      let scrollViewName = "";
      while (current) {
        if (scrollables.includes(current.name)) {
          hasScrollViewAncestor = true;
          scrollViewName = current.name;
          break;
        }
        current = current.parent;
      }

      if (hasScrollViewAncestor) {
        addDiagnostic(
          "SPACER_INSIDE_SCROLLVIEW",
          widget.line,
          widget.col,
          `Layout crash risk: 'Spacer' is placed inside a scroll view '${scrollViewName}', causing unbounded height/width layout exception.`
        );
      }
    }

    // Rule: INFINITE_ASPECT_RATIO
    if (widget.name === "AspectRatio") {
      let current = widget.parent;
      let hasScrollViewAncestor = false;
      let hasSizingBoundary = false;
      let scrollViewName = "";
      while (current) {
        if (scrollables.includes(current.name)) {
          hasScrollViewAncestor = true;
          scrollViewName = current.name;
          break;
        }
        if (current.name === "Container" || current.name === "SizedBox" || current.name === "ConstrainedBox") {
          hasSizingBoundary = true;
          break;
        }
        current = current.parent;
      }

      if (hasScrollViewAncestor && !hasSizingBoundary) {
        addDiagnostic(
          "INFINITE_ASPECT_RATIO",
          widget.line,
          widget.col,
          `Layout crash risk: 'AspectRatio' is placed inside a scroll view '${scrollViewName}' without any width/height constraint boundary.`
        );
      }
    }


    // Rule: FLEX_CHILD_VIEWPORT
    if (scrollables.includes(widget.name)) {
      let current = widget.parent;
      let hasFlexAncestor = false;
      let hasFlexibleAncestor = false;
      while (current) {
        if (current.name === "Row" || current.name === "Column" || current.name === "Flex") {
          hasFlexAncestor = true;
          break;
        }
        if (current.name === "Expanded" || current.name === "Flexible") {
          hasFlexibleAncestor = true;
        }
        current = current.parent;
      }

      if (hasFlexAncestor && !hasFlexibleAncestor) {
        const isShrinkWrap = /shrinkWrap\s*:\s*true\b/.test(widget.directText);
        if (!isShrinkWrap) {
          addDiagnostic(
            "FLEX_CHILD_VIEWPORT",
            widget.line,
            widget.col,
            `Unbounded layout risk: '${widget.name}' is placed inside a Flex container without Expanded/Flexible or shrinkWrap: true.`
          );
        }
      }
    }

    // Rule: TEXT_OVERFLOW_IN_FLEX
    if (widget.name === "Text" || widget.name === "RichText") {
      let current = widget.parent;
      let closestFlex = null;
      let hasFlexible = false;

      while (current) {
        if (current.name === "Row" || current.name === "Column" || current.name === "Flex") {
          closestFlex = current;
          break;
        }
        if (current.name === "Expanded" || current.name === "Flexible") {
          hasFlexible = true;
        }
        current = current.parent;
      }

      // Overflows are primarily an issue in Rows (horizontal overflow)
      if (closestFlex && closestFlex.name === "Row" && !hasFlexible) {
        const hasOverflowProp = /overflow\s*:\sHash/.test(widget.directText) || /overflow\s*:\s*/.test(widget.directText);
        if (!hasOverflowProp) {
          addDiagnostic(
            "TEXT_OVERFLOW_IN_FLEX",
            widget.line,
            widget.col,
            `Horizontal overflow risk: Text is placed in a Row without Expanded/Flexible wrap or TextOverflow styling.`
          );
        }
      }
    }

    // Rule: NESTED_VIEWPORTS
    if (scrollables.includes(widget.name)) {
      let current = widget.parent;
      let insideScrollable = false;
      while (current) {
        if (scrollables.includes(current.name)) {
          insideScrollable = true;
          break;
        }
        current = current.parent;
      }

      if (insideScrollable) {
        const isShrinkWrap = /shrinkWrap\s*:\s*true\b/.test(widget.directText);
        const hasNeverScroll = /physics\s*:\s*(?:const\s+)?NeverScrollableScrollPhysics\b/.test(widget.directText);
        if (!isShrinkWrap || !hasNeverScroll) {
          addDiagnostic(
            "NESTED_VIEWPORTS",
            widget.line,
            widget.col,
            `Nested Scrollables crash risk: Scrollable widget '${widget.name}' is nested inside another scrollable without shrinkWrap: true and NeverScrollableScrollPhysics.`
          );
        }
      }
    }

    // Rule: HARDCODED_SIZES
    const sizeMatches = [...widget.directText.matchAll(/(?:width|height)\s*:\s*([0-9.]+)\b/g)];
    for (const sizeMatch of sizeMatches) {
      const sizeVal = parseFloat(sizeMatch[1]);
      if (sizeVal > 320) {
        addDiagnostic(
          "HARDCODED_SIZES",
          widget.line,
          widget.col + sizeMatch.index,
          `Responsive design issue: Hardcoded size of ${sizeVal} may cause screen overflow on smaller device viewports.`
        );
      }
    }

    // Rule: DEEP_WIDGET_TREE
    let depth = 0;
    let curr = widget.parent;
    while (curr) {
      depth++;
      curr = curr.parent;
    }
    if (depth === 8) {
      addDiagnostic(
        "DEEP_WIDGET_TREE",
        widget.line,
        widget.col,
        `Performance warning: Deeply nested widget tree detected (depth exceeds 8 levels starting from parent '${widget.parent ? widget.parent.name : "root"}').`
      );
    }

    // Rule: MISSING_CONST_CONSTRUCTOR
    const targetConstWidgets = ["SizedBox", "Padding", "Spacer", "Divider", "VerticalDivider"];
    if (targetConstWidgets.includes(widget.name)) {
      if (!hasConstAncestor(widget, cleaned)) {
        const insideText = cleaned.substring(widget.openParenIdx + 1, widget.endIdx);
        const argsWithoutLabels = insideText.replace(/\b\w+\s*:/g, " ").trim();
        
        let isConst = false;
        if (widget.name === "Spacer" && argsWithoutLabels === "") {
          isConst = true;
        } else if ((widget.name === "SizedBox" || widget.name === "Divider" || widget.name === "VerticalDivider") &&
                   /^[0-9.\s,]*$/.test(argsWithoutLabels)) {
          isConst = true;
        } else if (widget.name === "Padding" && 
                   /^\s*EdgeInsets\.(?:all|symmetric|only|zero)\s*\([0-9.\s,]*\)\s*$/.test(argsWithoutLabels)) {
          isConst = true;
        }

        if (isConst) {
          addDiagnostic(
            "MISSING_CONST_CONSTRUCTOR",
            widget.line,
            widget.col,
            `Performance optimization: Missing 'const' prefix on '${widget.name}' instantiation with constant arguments.`
          );
        }
      }
    }

    // Rule: HARDCODED_UI_STRING
    if (widget.name === "Text") {
      const rawInside = content.substring(widget.openParenIdx + 1, widget.endIdx);
      const firstArg = rawInside.split(",")[0].trim();
      const isLiteral = /^['"].*['"]$/.test(firstArg) || /^r['"].*['"]$/.test(firstArg);
      const hasInterpolation = /\$\w+|\$\{.*\}/.test(firstArg);
      if (isLiteral && !hasInterpolation && firstArg.length > 2) {
        addDiagnostic(
          "HARDCODED_UI_STRING",
          widget.line,
          widget.col,
          `Internationalization smell: Hardcoded text string ${firstArg} used in Text widget. Recommends extracting to AppLocalizations.`
        );
      }
    }
  }

  // 2. Run State & Performance Regex Rules

  // Rule: UNDISPOSED_CONTROLLER
  const controllerDeclRegex = /\b(TextEditingController|ScrollController|AnimationController|PageController|TabController)\s+(\w+)\b/g;
  const finalControllerRegex = /\bfinal\s+(\w+)\s*=\s*(TextEditingController|ScrollController|AnimationController|PageController|TabController)\b/g;

  const controllerNames = new Set();
  const controllerMap = new Map();

  let ctrlMatch;
  while ((ctrlMatch = controllerDeclRegex.exec(cleaned)) !== null) {
    const type = ctrlMatch[1];
    const name = ctrlMatch[2];
    controllerNames.add(name);
    controllerMap.set(name, { type, index: ctrlMatch.index });
  }

  let finalCtrlMatch;
  while ((finalCtrlMatch = finalControllerRegex.exec(cleaned)) !== null) {
    const name = finalCtrlMatch[1];
    const type = finalCtrlMatch[2];
    controllerNames.add(name);
    controllerMap.set(name, { type, index: finalCtrlMatch.index });
  }

  for (const ctrlName of controllerNames) {
    const disposeCallRegex = new RegExp(`\\b${ctrlName}\\.dispose\\s*\\(`, 'g');
    if (!disposeCallRegex.test(cleaned)) {
      const { type, index } = controllerMap.get(ctrlName);
      const { line, col } = getLineCol(content, index);
      addDiagnostic(
        "UNDISPOSED_CONTROLLER",
        line,
        col,
        `Memory leak risk: Controller '${ctrlName}' of type '${type}' is declared but never disposed of in the file.`
      );
    }
  }

  // Rule: SETSTATE_IN_SCROLL_LISTENER
  const addListenerRegex = /\.\s*addListener\s*\(/g;
  let listenerMatch;
  while ((listenerMatch = addListenerRegex.exec(cleaned)) !== null) {
    const openParenIdx = listenerMatch.index + listenerMatch[0].length - 1;
    const closeParenIdx = findMatchingParen(cleaned, openParenIdx + 1);
    if (closeParenIdx !== -1) {
      const callbackContent = cleaned.substring(openParenIdx + 1, closeParenIdx);
      if (/\bsetState\s*\(/.test(callbackContent)) {
        const { line, col } = getLineCol(content, listenerMatch.index);
        addDiagnostic(
          "SETSTATE_IN_SCROLL_LISTENER",
          line,
          col,
          `Performance issue: Calling setState() inside a scroll/animation listener callback triggers excessive rebuilds.`
        );
      }
    }
  }

  // Rule: CONTROLLER_INSTANTIATED_IN_BUILD
  const buildMethodRegex = /\bWidget\s+build\s*\([^)]*\)\s*\{/g;
  let buildMatch;
  while ((buildMatch = buildMethodRegex.exec(cleaned)) !== null) {
    const openBraceIdx = buildMatch.index + buildMatch[0].length - 1;
    const closeBraceIdx = findMatchingBrace(cleaned, openBraceIdx + 1);
    if (closeBraceIdx !== -1) {
      const buildBody = cleaned.substring(openBraceIdx + 1, closeBraceIdx);
      const controllerInstRegex = /\b(TextEditingController|ScrollController|AnimationController|PageController|TabController)\s*\(/g;
      let instMatch;
      while ((instMatch = controllerInstRegex.exec(buildBody)) !== null) {
        const { line, col } = getLineCol(content, buildMatch.index + buildMatch[0].length + instMatch.index);
        addDiagnostic(
          "CONTROLLER_INSTANTIATED_IN_BUILD",
          line,
          col,
          `State management issue: Instantiating controller '${instMatch[1]}' inside build() resets its state on every rebuild.`
        );
      }
    }
  }

  // Rule: ASYNC_AWAIT_UNMOUNTED
  const awaitRegex = /\bawait\s+/g;
  let awaitMatch;
  while ((awaitMatch = awaitRegex.exec(cleaned)) !== null) {
    const subsequence = cleaned.substring(awaitMatch.index, Math.min(cleaned.length, awaitMatch.index + 300));
    if (/\bsetState\s*\(/.test(subsequence) && !/\bmounted\b/.test(subsequence)) {
      const { line, col } = getLineCol(content, awaitMatch.index);
      addDiagnostic(
        "ASYNC_AWAIT_UNMOUNTED",
        line,
        col,
        `State safety concern: Calling setState() after an async await without verifying if the widget is still mounted.`
      );
    }
  }

  // Rule: MISSING_ASSET_DECLARATION & MISSING_ASSET_FILE
  const assetRegex = /(?:Image\.asset|AssetImage|SvgPicture\.asset)\s*\(\s*['"]([^'"]+)['"]/g;
  let assetMatch;
  while ((assetMatch = assetRegex.exec(content)) !== null) {
    const assetPath = assetMatch[1];
    const { line, col } = getLineCol(content, assetMatch.index);
    
    if (hasPubspec) {
      const isDeclared = pubspecAssets.some(p => {
        if (p.endsWith("/")) {
          return assetPath.startsWith(p);
        }
        return p === assetPath;
      });
      if (!isDeclared) {
        addDiagnostic(
          "MISSING_ASSET_DECLARATION",
          line,
          col,
          `Asset registry issue: Asset '${assetPath}' is referenced in code but not registered under 'assets:' in pubspec.yaml.`
        );
      }
    }

    const resolvedAssetPath = path.join(projectRoot, assetPath);
    if (!(await fs.pathExists(resolvedAssetPath))) {
      addDiagnostic(
        "MISSING_ASSET_FILE",
        line,
        col,
        `Asset file error: Asset file '${assetPath}' does not exist on disk at path: ${resolvedAssetPath}.`
      );
    }
  }

  // 3. Run Regex/Line-based Null Safety Rules

  // Rule: FORCE_UNWRAP
  const forceUnwrapRegex = /\b(\w+|\)|\])\s*!(?!=)/g;
  let unwrapMatch;
  while ((unwrapMatch = forceUnwrapRegex.exec(cleaned)) !== null) {
    const { line, col } = getLineCol(content, unwrapMatch.index + unwrapMatch[1].length);
    addDiagnostic(
      "FORCE_UNWRAP",
      line,
      col,
      `Unsafe null assertion: Force-unwrap operator '!' used, risking a runtime crash if value is null.`
    );
  }

  // Rule: UNSAFE_CAST
  const unsafeCastRegex = /\s+as\s+([A-Z]\w*(?:<[^>]+>)?)/g;
  let castMatch;
  while ((castMatch = unsafeCastRegex.exec(cleaned)) !== null) {
    const { line, col } = getLineCol(content, castMatch.index + 1);
    addDiagnostic(
      "UNSAFE_CAST",
      line,
      col,
      `Unsafe type cast: Using 'as ${castMatch[1]}' operator. Cast failure will trigger a runtime TypeError.`
    );
  }

  // Rule: UNINITIALIZED_LATE_VAR
  const lines = cleaned.split("\n");
  for (let l = 0; l < lines.length; l++) {
    const lineText = lines[l];
    if (/\blate\s+/.test(lineText) && /;\s*$/.test(lineText) && !/=\s*/.test(lineText)) {
      addDiagnostic(
        "UNINITIALIZED_LATE_VAR",
        l + 1,
        lineText.indexOf("late") + 1,
        `Late variable safety: Uninitialized late variable declared. Risky if accessed before assignment.`
      );
    }
  }

  // Rule: AVOID_PRINT
  const printRegex = /\bprint\s*\(/g;
  let printMatch;
  while ((printMatch = printRegex.exec(cleaned)) !== null) {
    const { line, col } = getLineCol(content, printMatch.index);
    addDiagnostic(
      "AVOID_PRINT",
      line,
      col,
      `Production logging concern: Avoid using raw print() statement. Use debugPrint() or log() instead.`
    );
  }

  // Rule: UNDISPOSED_FOCUS_NODE
  const focusNodeDeclRegex = /\bFocusNode\s+(\w+)\b/g;
  const finalFocusNodeRegex = /\bfinal\s+(\w+)\s*=\s*FocusNode\b/g;

  const focusNodeNames = new Set();
  const focusNodeMap = new Map();

  let fnMatch;
  while ((fnMatch = focusNodeDeclRegex.exec(cleaned)) !== null) {
    const name = fnMatch[1];
    focusNodeNames.add(name);
    focusNodeMap.set(name, fnMatch.index);
  }

  let finalFnMatch;
  while ((finalFnMatch = finalFocusNodeRegex.exec(cleaned)) !== null) {
    const name = finalFnMatch[1];
    focusNodeNames.add(name);
    focusNodeMap.set(name, finalFnMatch.index);
  }

  for (const fnName of focusNodeNames) {
    const disposeCallRegex = new RegExp(`\\b${fnName}\\.dispose\\s*\\(`, 'g');
    if (!disposeCallRegex.test(cleaned)) {
      const index = focusNodeMap.get(fnName);
      const { line, col } = getLineCol(content, index);
      addDiagnostic(
        "UNDISPOSED_FOCUS_NODE",
        line,
        col,
        `Memory leak risk: FocusNode '${fnName}' is declared but never disposed of in the file.`
      );
    }
  }

  // Rule: UNCLOSED_STREAM_CONTROLLER
  const streamDeclRegex = /\bStreamController(?:\s*<[^>]*>)?\s+(\w+)\b/g;
  const finalStreamRegex = /\bfinal\s+(\w+)\s*=\s*StreamController(?:\s*<[^>]*>)?\b/g;

  const streamNames = new Set();
  const streamMap = new Map();

  let scMatch;
  while ((scMatch = streamDeclRegex.exec(cleaned)) !== null) {
    const name = scMatch[1];
    streamNames.add(name);
    streamMap.set(name, scMatch.index);
  }

  let finalScMatch;
  while ((finalScMatch = finalStreamRegex.exec(cleaned)) !== null) {
    const name = finalScMatch[1];
    streamNames.add(name);
    streamMap.set(name, finalScMatch.index);
  }

  for (const scName of streamNames) {
    const closeCallRegex = new RegExp(`\\b${scName}\\.close\\s*\\(`, 'g');
    if (!closeCallRegex.test(cleaned)) {
      const index = streamMap.get(scName);
      const { line, col } = getLineCol(content, index);
      addDiagnostic(
        "UNCLOSED_STREAM_CONTROLLER",
        line,
        col,
        `Memory leak risk: StreamController '${scName}' is declared but never closed in the file.`
      );
    }
  }

  // Rule: STATELESS_CANDIDATE
  const stateClassRegex = /\bclass\s+(\w+)\s+extends\s+State\s*<\s*\w+\s*>\s*\{/g;
  let stateMatch;
  while ((stateMatch = stateClassRegex.exec(cleaned)) !== null) {
    const className = stateMatch[1];
    const openBraceIdx = stateMatch.index + stateMatch[0].length - 1;
    const closeBraceIdx = findMatchingBrace(cleaned, openBraceIdx + 1);
    if (closeBraceIdx !== -1) {
      const classBody = cleaned.substring(openBraceIdx + 1, closeBraceIdx);
      if (!/\bsetState\s*\(/.test(classBody)) {
        const createStateRegex = new RegExp(`createState\\s*\\(\\s*\\)\\s*=>\\s*(?:const\\s+)?${className}\\s*\\(\\s*\\)`);
        if (createStateRegex.test(cleaned)) {
          const { line, col } = getLineCol(content, stateMatch.index);
          addDiagnostic(
            "STATELESS_CANDIDATE",
            line,
            col,
            `Performance smell: State class '${className}' never calls setState(). This StatefulWidget can be refactored to a StatelessWidget.`
          );
        }
      }
    }
  }

  // Rule: HARDCODED_THEME_VALUES
  const hardcodedThemeRegex = /\b(?:Colors\.(?!transparent\b)\w+|Color\s*\(\s*0x[0-9a-fA-F]+\s*\)|TextStyle\s*\()/g;
  let themeMatch;
  while ((themeMatch = hardcodedThemeRegex.exec(cleaned)) !== null) {
    const { line, col } = getLineCol(content, themeMatch.index);
    addDiagnostic(
      "HARDCODED_THEME_VALUES",
      line,
      col,
      `Theme safety smell: Hardcoded styling '${themeMatch[0]}' used directly. Prefer using Theme.of(context) properties.`
    );
  }

  // Rule: MISSING_WIDGET_KEY
  const widgetClassRegex = /\bclass\s+(\w+)\s+extends\s+(?:StatelessWidget|StatefulWidget)/g;
  let classMatch;
  while ((classMatch = widgetClassRegex.exec(cleaned)) !== null) {
    const className = classMatch[1];
    const subsequence = cleaned.substring(classMatch.index, Math.min(cleaned.length, classMatch.index + 1000));
    const constructorRegex = new RegExp(`\\b${className}\\s*\\(([^)]*)\\)`);
    const constrMatch = constructorRegex.exec(subsequence);
    if (constrMatch) {
      const args = constrMatch[1];
      if (!/\bkey\b/.test(args)) {
        const { line, col } = getLineCol(content, classMatch.index + constrMatch.index);
        addDiagnostic(
          "MISSING_WIDGET_KEY",
          line,
          col,
          `Widget identification concern: Class '${className}' constructor is missing 'key' or 'super.key' parameter.`
        );
      }
    }
  }

  // Rule: UNUSED_IMPORTS_VARIABLES
  const privateFieldRegex = /\b(?:var|final|late|const|[a-zA-Z]\w*(?:<[^>]+>)?)\s+(?:[a-zA-Z]\w*(?:<[^>]+>)?\s+)?(_\w+)\b/g;
  let privateMatch;
  while ((privateMatch = privateFieldRegex.exec(cleaned)) !== null) {
    const varName = privateMatch[1];
    const escapedVarName = varName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const occurrences = (cleaned.match(new RegExp(`\\b${escapedVarName}\\b`, 'g')) || []).length;
    if (occurrences === 1) {
      const { line, col } = getLineCol(content, privateMatch.index);
      addDiagnostic(
        "UNUSED_IMPORTS_VARIABLES",
        line,
        col,
        `Cleanliness warning: Private variable '${varName}' is declared but never referenced or used.`
      );
    }
  }

  const importAliasRegex = /\bimport\s+['"][^'"]+['"]\s+as\s+(\w+)\s*;/g;
  let importMatch;
  while ((importMatch = importAliasRegex.exec(content)) !== null) {
    const alias = importMatch[1];
    const occurrences = (cleaned.match(new RegExp(`\\b${alias}\\b`, 'g')) || []).length;
    if (occurrences === 1) {
      const { line, col } = getLineCol(content, importMatch.index);
      addDiagnostic(
        "UNUSED_IMPORTS_VARIABLES",
        line,
        col,
        `Cleanliness warning: Import alias '${alias}' is imported but never used in the file.`
      );
    }
  }

  // Rule: MEDIA_QUERY_OVERHEAD
  const mediaQueryRegex = /\bMediaQuery\s*\.\s*of\s*\(\s*context\s*\)/g;
  let mqMatch;
  while ((mqMatch = mediaQueryRegex.exec(cleaned)) !== null) {
    const { line, col } = getLineCol(content, mqMatch.index);
    addDiagnostic(
      "MEDIA_QUERY_OVERHEAD",
      line,
      col,
      `Performance concern: MediaQuery.of(context) triggers rebuilds on screen size changes. Prefer LayoutBuilder or BoxConstraints.`
    );
  }

  // Rule: UNSAFE_NAVIGATOR_POP
  const popAwaitRegex = /\bawait\b/g;
  let popAwaitMatch;
  while ((popAwaitMatch = popAwaitRegex.exec(cleaned)) !== null) {
    const startIdx = popAwaitMatch.index;
    const windowText = cleaned.substring(startIdx, Math.min(cleaned.length, startIdx + 1000));
    const popRegex = /\bNavigator\s*\.\s*(?:of\s*\(\s*context\s*\)\s*\.\s*)?pop\s*\(/;
    const popMatch = popRegex.exec(windowText);
    if (popMatch) {
      const textBetween = windowText.substring(0, popMatch.index);
      const laterAwait = /\bawait\b/.test(textBetween.substring(5));
      if (!laterAwait) {
        if (!/\bmounted\b/.test(textBetween)) {
          const { line, col } = getLineCol(content, startIdx + popMatch.index);
          addDiagnostic(
            "UNSAFE_NAVIGATOR_POP",
            line,
            col,
            `Safety gap warning: Navigator.pop called after await without validating if the widget is mounted.`
          );
        }
      }
    }
  }

  return diagnostics;
}

// Scan a directory recursively for Dart files
export async function analyzeDirectory(dirPath, options = {}) {
  const { excludePaths = [] } = options;
  const resolvedDir = path.resolve(dirPath);

  // Read pubspec.yaml for assets
  let pubspecAssets = [];
  const pubspecPath = path.join(resolvedDir, "pubspec.yaml");
  if (await fs.pathExists(pubspecPath)) {
    try {
      const pubspecText = await fs.readFile(pubspecPath, "utf8");
      pubspecAssets = parsePubspecAssets(pubspecText);
    } catch (err) {
      console.error(`Failed to parse pubspec.yaml at ${pubspecPath}: ${err.message}`);
    }
  }

  const getFiles = async (dir) => {
    const subdirs = await fs.readdir(dir);
    const files = await Promise.all(
      subdirs.map(async (subdir) => {
        const res = path.resolve(dir, subdir);
        const stat = await fs.stat(res);

        // Filter out hidden folders and excluded directories
        const isExcluded = excludePaths.some(p => res.includes(p)) ||
          subdir === "node_modules" ||
          subdir === ".git" ||
          subdir === "build" ||
          subdir === ".dart_tool" ||
          subdir.endsWith(".g.dart") ||
          subdir.endsWith(".freezed.dart");

        if (isExcluded) return [];
        return stat.isDirectory() ? getFiles(res) : res;
      })
    );
    return files.flat();
  };

  const allFiles = await getFiles(resolvedDir);
  const dartFiles = allFiles.filter(f => f.endsWith(".dart"));

  const allDiagnostics = [];
  for (const file of dartFiles) {
    try {
      const fileDiagnostics = await analyzeDartFile(file, {
        pubspecAssets,
        projectRoot: resolvedDir,
        hasPubspec: true
      });
      allDiagnostics.push(...fileDiagnostics);
    } catch (e) {
      console.error(`Error analyzing file ${file}:`, e);
    }
  }

  return allDiagnostics;
}
