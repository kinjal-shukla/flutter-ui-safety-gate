# Flutter UI Safety Gate

A **Model Context Protocol (MCP) server** that enforces Flutter UI layout safety, null safety, and code quality rules — directly inside your AI coding tool.

Works with **Claude, Cursor, Windsurf, VS Code** and any MCP-compatible AI tool. Includes a one-time global git pre-commit hook that protects **all your projects** automatically.

---

## Features

| Tool | Description |
|---|---|
| `analyze_file` | Scan a single Dart file for layout & null safety violations |
| `analyze_project` | Scan an entire Flutter project recursively |
| `check_git_diff` | Check only staged files before committing |
| `auto_fix_issues` | Auto-repair common layout bugs and unsafe casts |
| `generate_report` | Generate a markdown QA report with Project Health Index |
| `ai_review_file` | AI-powered deep code review via OpenRouter |
| `ai_review_project` | AI-powered review of entire project |
| `generate_model_class` | Generate Dart model classes from JSON or API endpoint |
| `setup_global_git_hook` | Install a global pre-commit hook for all git projects |

---

## Rules Enforced

### Layout & Crash Risks
- `INVALID_EXPANDED_PARENT` — Expanded/Flexible outside Row/Column/Flex
- `POSITIONED_OUTSIDE_STACK` — Positioned outside Stack
- `SPACER_OUTSIDE_FLEX` — Spacer outside Row/Column/Flex
- `SPACER_INSIDE_SCROLLVIEW` — Spacer inside scrollable (unbounded height)
- `FLEX_CHILD_VIEWPORT` — ListView/GridView inside Flex without Expanded or shrinkWrap
- `NESTED_VIEWPORTS` — Scrollable inside scrollable without shrinkWrap + NeverScrollableScrollPhysics
- `INFINITE_ASPECT_RATIO` — AspectRatio inside scroll view without constraints
- `TEXT_OVERFLOW_IN_FLEX` — Text in Row without Expanded or overflow handling
- `HARDCODED_SIZES` — Width/height values > 320 hardcoded (screen overflow risk)

### Null & Type Safety
- `FORCE_UNWRAP` — Force-unwrap operator `!` usage
- `UNSAFE_CAST` — Unsafe `as Type` cast without null check
- `UNINITIALIZED_LATE_VAR` — `late` variable declared without initialization

### Memory Leaks
- `UNDISPOSED_CONTROLLER` — TextEditingController, ScrollController etc. never disposed
- `UNDISPOSED_FOCUS_NODE` — FocusNode never disposed
- `UNCLOSED_STREAM_CONTROLLER` — StreamController never closed

### Performance
- `SETSTATE_IN_SCROLL_LISTENER` — setState inside scroll/animation listener
- `CONTROLLER_INSTANTIATED_IN_BUILD` — Controller instantiated inside build()
- `ASYNC_AWAIT_UNMOUNTED` — setState after await without mounted check
- `MISSING_CONST_CONSTRUCTOR` — Missing `const` on constant widgets
- `DEEP_WIDGET_TREE` — Widget tree depth exceeds 8 levels
- `STATELESS_CANDIDATE` — StatefulWidget that never calls setState
- `MEDIA_QUERY_OVERHEAD` — MediaQuery.of(context) triggering excess rebuilds

### Code Quality
- `HARDCODED_UI_STRING` — Hardcoded strings in Text widget (i18n smell)
- `HARDCODED_THEME_VALUES` — Colors/TextStyle hardcoded instead of Theme.of(context)
- `MISSING_WIDGET_KEY` — Widget constructor missing `key` parameter
- `UNUSED_IMPORTS_VARIABLES` — Private variables or import aliases never used
- `AVOID_PRINT` — Raw print() used instead of debugPrint()
- `MISSING_ASSET_DECLARATION` — Asset referenced but not declared in pubspec.yaml
- `MISSING_ASSET_FILE` — Asset file referenced but does not exist on disk
- `UNSAFE_NAVIGATOR_POP` — Navigator.pop called after await without mounted check

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/flutter-ui-safety-gate.git
cd flutter-ui-safety-gate
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and add your OpenRouter API key:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
```

> Get a free API key at [openrouter.ai](https://openrouter.ai)

---

## Setup in Your AI Tool

### Claude Desktop / Claude Code

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "flutter-ui-safety-gate": {
      "command": "node",
      "args": ["/absolute/path/to/flutter-ui-safety-gate/server.js"]
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "flutter-ui-safety-gate": {
      "command": "node",
      "args": ["/absolute/path/to/flutter-ui-safety-gate/server.js"]
    }
  }
}
```

### Windsurf

Add to Windsurf MCP settings:

```json
{
  "mcpServers": {
    "flutter-ui-safety-gate": {
      "command": "node",
      "args": ["/absolute/path/to/flutter-ui-safety-gate/server.js"]
    }
  }
}
```

---

## Global Git Pre-commit Hook

Run this **once** from any AI tool to protect all your git projects automatically:

```
setup_global_git_hook
```

This will:
- Create `~/.git-hooks/pre-commit`
- Set `git config --global core.hooksPath ~/.git-hooks`
- Check staged Dart files on every `git commit` — in **any project, any editor, any AI tool**

### What the hook does on each commit:

```
git commit
    ↓
Pre-commit hook fires automatically
    ↓
Checks all staged .dart files using Safety Gate rules
    ↓
Blockers found? → Commit BLOCKED with details
All clear?      → Commit proceeds normally
```

No API key or internet connection required for the hook — it runs the analyzer locally via Node.js.

---

## Usage Examples

### Analyze a single file
```
analyze_file with filePath: "lib/screens/home_screen.dart"
```

### Analyze entire project
```
analyze_project with projectPath: "."
```

### Check staged files before commit
```
check_git_diff with projectPath: "."
```

### Auto-fix a file
```
auto_fix_issues with filePath: "lib/widgets/my_widget.dart"
```

### Generate a Dart model from JSON
```
generate_model_class with jsonInput: '{"id":1,"name":"John"}' and className: "UserModel"
```

### Generate a Dart model from API endpoint
```
generate_model_class with jsonInput: "https://api.example.com/users/1" and className: "UserResponse"
```

### AI-powered review
```
ai_review_file with filePath: "lib/screens/checkout_screen.dart"
```

---

## Project Structure

```
flutter-ui-safety-gate/
├── server.js                  # MCP server entry point
├── src/
│   ├── analyzer/              # Core static analysis engine
│   │   ├── index.js           # Dart file & directory analyzer
│   │   └── rules.js           # All rule definitions
│   ├── autofix/               # Auto-fix engine
│   ├── ai-review/             # OpenRouter AI review integration
│   ├── hooks/
│   │   └── check-staged.js    # Git pre-commit hook runner
│   └── utils/
│       ├── formatter.js       # JSON & markdown formatters
│       ├── generator.js       # Dart model class generator
│       └── docParser.js       # API/Swagger doc parser
├── .env.example               # Environment variable template
└── package.json
```

---

## Requirements

- Node.js 18+
- Git (for pre-commit hook features)
- OpenRouter API key (only for `ai_review_file` and `ai_review_project` tools)

---

## License

ISC
