import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { analyzeDartFile } from "../src/analyzer/index.js";
import { applyAutoFixes } from "../src/autofix/index.js";
import { generateDartClasses } from "../src/utils/generator.js";
import { discoverApiDetails, resolveDetailsFromSwaggerUi } from "../src/utils/docParser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.resolve(__dirname, "temp_test_project");

const TEST_CASES = [
  {
    name: "INVALID_EXPANDED_PARENT check",
    file: "invalid_expanded.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      child: Expanded(
        child: Text("Invalid parent!"),
      ),
    );
  }
}`,
    expectedRule: "INVALID_EXPANDED_PARENT",
    expectedLine: 6
  },
  {
    name: "FLEX_CHILD_VIEWPORT check & autofix",
    file: "flex_child_viewport.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ListView(
          children: [Text("Item")],
        ),
      ],
    );
  }
}`,
    expectedRule: "FLEX_CHILD_VIEWPORT",
    expectedLine: 7,
    checkAutofix: true,
    expectedAutofixSubstring: "Expanded(child: ListView("
  },
  {
    name: "TEXT_OVERFLOW_IN_FLEX check & autofix",
    file: "text_overflow_flex.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text("Long text here"),
      ],
    );
  }
}`,
    expectedRule: "TEXT_OVERFLOW_IN_FLEX",
    expectedLine: 7,
    checkAutofix: true,
    expectedAutofixSubstring: 'Text("Long text here", overflow: TextOverflow.ellipsis)'
  },
  {
    name: "NESTED_VIEWPORTS check & autofix",
    file: "nested_viewports.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: ListView(
        children: [Text("Nested")],
      ),
    );
  }
}`,
    expectedRule: "NESTED_VIEWPORTS",
    expectedLine: 6,
    checkAutofix: true,
    expectedAutofixSubstring: "shrinkWrap: true"
  },
  {
    name: "HARDCODED_SIZES check",
    file: "hardcoded_sizes.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 500.0,
      height: 100.0,
    );
  }
}`,
    expectedRule: "HARDCODED_SIZES",
    expectedLine: 5
  },
  {
    name: "FORCE_UNWRAP check & autofix",
    file: "force_unwrap.dart",
    code: `void main() {
  String? name;
  print(name!);
}`,
    expectedRule: "FORCE_UNWRAP",
    expectedLine: 3,
    checkAutofix: true,
    expectedAutofixSubstring: "name ?? ''"
  },
  {
    name: "UNSAFE_CAST check & autofix",
    file: "unsafe_cast.dart",
    code: `void main() {
  dynamic data = "some data";
  var text = data as String;
}`,
    expectedRule: "UNSAFE_CAST",
    expectedLine: 3,
    checkAutofix: true,
    expectedAutofixSubstring: "(data is String ? data : '')"
  },
  {
    name: "UNINITIALIZED_LATE_VAR check",
    file: "late_vars.dart",
    code: `class Controller {
  late String title;
  late int count = 10;
}`,
    expectedRule: "UNINITIALIZED_LATE_VAR",
    expectedLine: 2
  },
  {
    name: "UNDISPOSED_CONTROLLER check & autofix",
    file: "undisposed_controller.dart",
    code: `import 'package:flutter/material.dart';
class MyWidgetState extends State<MyWidget> {
  TextEditingController nameController = TextEditingController();
  @override
  void dispose() {
    super.dispose();
  }
}`,
    expectedRule: "UNDISPOSED_CONTROLLER",
    expectedLine: 3,
    checkAutofix: true,
    expectedAutofixSubstring: "nameController.dispose();"
  },
  {
    name: "SETSTATE_IN_SCROLL_LISTENER check",
    file: "setstate_listener.dart",
    code: `import 'package:flutter/material.dart';
class MyWidgetState extends State<MyWidget> {
  ScrollController controller = ScrollController();
  @override
  void initState() {
    super.initState();
    controller.addListener(() {
      setState(() {});
    });
  }
}`,
    expectedRule: "SETSTATE_IN_SCROLL_LISTENER",
    expectedLine: 7
  },
  {
    name: "DEEP_WIDGET_TREE check",
    file: "deep_widget_tree.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      child: Container(
        child: Container(
          child: Container(
            child: Container(
              child: Container(
                child: Container(
                  child: Container(
                    child: Container(
                      child: Text("So Deep!"),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}`,
    expectedRule: "DEEP_WIDGET_TREE",
    expectedLine: 13
  },
  {
    name: "MISSING_CONST_CONSTRUCTOR check & autofix",
    file: "missing_const.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 10,
      height: 20,
    );
  }
}`,
    expectedRule: "MISSING_CONST_CONSTRUCTOR",
    expectedLine: 5,
    checkAutofix: true,
    expectedAutofixSubstring: "const SizedBox("
  },
  {
    name: "MISSING_ASSET_FILE check",
    file: "missing_asset.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Image.asset('assets/images/non_existent.png');
  }
}`,
    expectedRule: "MISSING_ASSET_FILE",
    expectedLine: 5
  },
  {
    name: "HARDCODED_UI_STRING check",
    file: "hardcoded_string.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Text("Click me");
  }
}`,
    expectedRule: "HARDCODED_UI_STRING",
    expectedLine: 5
  },
  {
    name: "CONTROLLER_INSTANTIATED_IN_BUILD check",
    file: "controller_build.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final controller = TextEditingController();
    return SizedBox(width: 10);
  }
}`,
    expectedRule: "CONTROLLER_INSTANTIATED_IN_BUILD",
    expectedLine: 5
  },
  {
    name: "ASYNC_AWAIT_UNMOUNTED check",
    file: "async_mounted.dart",
    code: `import 'package:flutter/material.dart';
class MyWidgetState extends State<MyWidget> {
  @override
  Widget build(BuildContext context) => SizedBox();
  void load() async {
    await Future.delayed(Duration(seconds: 1));
    setState(() {});
  }
}`,
    expectedRule: "ASYNC_AWAIT_UNMOUNTED",
    expectedLine: 6
  },
  {
    name: "STATELESS_CANDIDATE check",
    file: "stateless_candidate.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatefulWidget {
  @override
  State<MyWidget> createState() => _MyWidgetState();
}
class _MyWidgetState extends State<MyWidget> {
  @override
  Widget build(BuildContext context) => SizedBox();
}`,
    expectedRule: "STATELESS_CANDIDATE",
    expectedLine: 6
  },
  {
    name: "AVOID_PRINT check",
    file: "avoid_print.dart",
    code: `void test() {
  print("Hello");
}`,
    expectedRule: "AVOID_PRINT",
    expectedLine: 2
  },
  {
    name: "UNDISPOSED_FOCUS_NODE check",
    file: "undisposed_focus_node.dart",
    code: `class MyState extends State<MyWidget> {
  final FocusNode myFocus = FocusNode();
  @override
  Widget build(BuildContext context) => SizedBox();
}`,
    expectedRule: "UNDISPOSED_FOCUS_NODE",
    expectedLine: 2
  },
  {
    name: "UNCLOSED_STREAM_CONTROLLER check",
    file: "unclosed_stream_controller.dart",
    code: `class MyState extends State<MyWidget> {
  final StreamController myStream = StreamController();
  @override
  Widget build(BuildContext context) => SizedBox();
}`,
    expectedRule: "UNCLOSED_STREAM_CONTROLLER",
    expectedLine: 2
  },
  {
    name: "HARDCODED_THEME_VALUES check",
    file: "hardcoded_theme.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(color: Colors.red);
  }
}`,
    expectedRule: "HARDCODED_THEME_VALUES",
    expectedLine: 5
  },
  {
    name: "MISSING_WIDGET_KEY check & autofix",
    file: "missing_widget_key.dart",
    code: `import 'package:flutter/material.dart';
class CustomButton extends StatelessWidget {
  CustomButton();
  @override
  Widget build(BuildContext context) => SizedBox();
}`,
    expectedRule: "MISSING_WIDGET_KEY",
    expectedLine: 3,
    checkAutofix: true,
    expectedAutofixSubstring: "CustomButton({super.key});"
  },
  {
    name: "UNUSED_IMPORTS_VARIABLES check",
    file: "unused_imports_variables.dart",
    code: `import 'package:flutter/material.dart';
import 'helper.dart' as helper;
class MyState {
  final int _unusedField = 0;
}`,
    expectedRule: "UNUSED_IMPORTS_VARIABLES",
    expectedLine: 2
  },
  {
    name: "MEDIA_QUERY_OVERHEAD check",
    file: "media_query_overhead.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return SizedBox();
  }
}`,
    expectedRule: "MEDIA_QUERY_OVERHEAD",
    expectedLine: 5
  },
  {
    name: "POSITIONED_OUTSIDE_STACK check",
    file: "positioned_outside_stack.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      child: Positioned(
        child: Text("Positioned outside stack!"),
      ),
    );
  }
}`,
    expectedRule: "POSITIONED_OUTSIDE_STACK",
    expectedLine: 6
  },
  {
    name: "SPACER_OUTSIDE_FLEX check",
    file: "spacer_outside_flex.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      child: Spacer(),
    );
  }
}`,
    expectedRule: "SPACER_OUTSIDE_FLEX",
    expectedLine: 6
  },
  {
    name: "SPACER_INSIDE_SCROLLVIEW check",
    file: "spacer_inside_scrollview.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        Spacer(),
      ],
    );
  }
}`,
    expectedRule: "SPACER_INSIDE_SCROLLVIEW",
    expectedLine: 7
  },
  {
    name: "UNSAFE_NAVIGATOR_POP check",
    file: "unsafe_navigator_pop.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatelessWidget {
  void myMethod() async {
    await Future.delayed(const Duration(seconds: 1));
    Navigator.pop(context);
  }
  @override
  Widget build(BuildContext context) => SizedBox();
}`,
    expectedRule: "UNSAFE_NAVIGATOR_POP",
    expectedLine: 5
  },
  {
    name: "INFINITE_ASPECT_RATIO check",
    file: "infinite_aspect_ratio.dart",
    code: `import 'package:flutter/material.dart';
class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        AspectRatio(
          aspectRatio: 16/9,
          child: SizedBox(),
        ),
      ],
    );
  }
}`,
    expectedRule: "INFINITE_ASPECT_RATIO",
    expectedLine: 7
  }
];

async function runTests() {
  console.log("🚀 Starting Flutter Layout Guard Regression Tests...\n");
  await fs.ensureDir(TEST_DIR);

  let passedTests = 0;
  let failedTests = 0;

  for (const tc of TEST_CASES) {
    console.log(`🧪 Testing: ${tc.name}`);
    const filePath = path.join(TEST_DIR, tc.file);

    try {
      // 1. Write mock file
      await fs.writeFile(filePath, tc.code, "utf8");

      // 2. Run analysis
      const diagnostics = await analyzeDartFile(filePath);
      const targetDiag = diagnostics.find(d => d.ruleId === tc.expectedRule && d.line === tc.expectedLine);

      if (!targetDiag) {
        const foundLines = diagnostics.filter(d => d.ruleId === tc.expectedRule).map(d => d.line);
        console.error(`  ❌ Failed: Expected rule ${tc.expectedRule} to be violated on line ${tc.expectedLine}, but found on line(s): [${foundLines.join(', ')}].`);
        failedTests++;
        continue;
      }

      console.log(`  ✅ Diagnostic check passed (Line ${targetDiag.line} correctly flagged).`);

      // 3. Test autofix if applicable
      if (tc.checkAutofix) {
        await applyAutoFixes(filePath);
        const fixedCode = await fs.readFile(filePath, "utf8");

        if (fixedCode.includes(tc.expectedAutofixSubstring)) {
          console.log(`  ✅ Autofix applied correctly: Found substring "${tc.expectedAutofixSubstring}".`);
        } else {
          console.error(`  ❌ Autofix verification failed. Expected code to contain "${tc.expectedAutofixSubstring}".`);
          console.error("  --- Updated Code ---");
          console.error(fixedCode);
          console.error("  --------------------");
          failedTests++;
          continue;
        }
      }

      passedTests++;
    } catch (err) {
      console.error(`  ❌ Exception encountered during test: ${err.message}`);
      failedTests++;
    }
  }

  // ─── Test JSON to Dart Model Generator ───────────────────────────
  console.log("\n🧪 Testing: JSON-to-Dart Model Generator");
  try {
    const mockJson = {
      name: "John Doe",
      age: 30,
      is_active: true,
      address: {
        city: "San Francisco",
        zip: 94103
      },
      tags: ["admin", "developer"]
    };

    const code = generateDartClasses(mockJson, "UserResponse");
    
    const hasRootClass = code.includes("class UserResponse");
    const hasChildClass = code.includes("class Address");
    const hasFromJson = code.includes("factory UserResponse.fromJson(Map<String, dynamic> json)");
    const hasToJson = code.includes("Map<String, dynamic> toJson()");
    const hasFieldNameCamel = code.includes("final bool? isActive;");

    if (hasRootClass && hasChildClass && hasFromJson && hasToJson && hasFieldNameCamel) {
      console.log("  ✅ Model generation test passed.");
      passedTests++;
    } else {
      console.error("  ❌ Model generation test failed: generated code did not contain all expected classes/methods.");
      console.error(code);
      failedTests++;
    }
  } catch (err) {
    console.error(`  ❌ Model generator test failed with exception: ${err.message}`);
    failedTests++;
  }

  // ─── Test Postman/Swagger Auto-Discovery ─────────────────────────
  console.log("\n🧪 Testing: Postman/Swagger Auto-Discovery");
  try {
    const mockPostmanCollection = {
      info: { name: "Test Collection" },
      item: [
        {
          name: "Login Request",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: {
              mode: "raw",
              raw: "{\"username\":\"admin\",\"password\":\"secret\"}"
            },
            url: {
              raw: "http://localhost:3000/api/login",
              path: ["api", "login"]
            }
          },
          response: [
            {
              name: "Successful Login Response",
              code: 200,
              body: "{\"success\":true,\"token\":\"mock-token-xyz\"}"
            }
          ]
        }
      ]
    };

    const mockCollectionPath = path.join(TEST_DIR, "test.postman_collection.json");
    await fs.outputJson(mockCollectionPath, mockPostmanCollection);

    const apiDetails = await discoverApiDetails("http://localhost:3000/api/login", TEST_DIR);
    
    if (
      apiDetails &&
      apiDetails.method === "POST" &&
      apiDetails.body === "{\"username\":\"admin\",\"password\":\"secret\"}" &&
      apiDetails.mockResponse &&
      apiDetails.mockResponse.success === true
    ) {
      console.log("  ✅ Postman auto-discovery test passed.");
      passedTests++;
    } else {
      console.error("  ❌ Postman auto-discovery test failed: details not matched.");
      console.error(apiDetails);
      failedTests++;
    }
  } catch (err) {
    console.error(`  ❌ Postman auto-discovery test failed with exception: ${err.message}`);
    failedTests++;
  }

  // ─── Test Swagger UI Web Docs Parser ─────────────────────────────
  console.log("\n🧪 Testing: Swagger UI Web Docs Parser");
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url) => {
      if (url.includes("swagger-ui-init.js")) {
        return {
          ok: true,
          text: async () => `
            window.onload = function() {
              const spec = {
                "openapi": "3.0.0",
                "paths": {
                  "/organization/login": {
                    "post": {
                      "operationId": "post_organization_login",
                      "responses": {
                        "200": {
                          "content": {
                            "application/json": {
                              "schema": {
                                "type": "object",
                                "properties": {
                                  "success": { "type": "boolean" },
                                  "token": { "type": "string" }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              };
              window.ui = SwaggerUIBundle({ spec: spec });
            };
          `
        };
      }
      return { ok: false };
    };

    const targetUrl = "https://cambridge-upskill-api-dev.devpress.net/docs/#/Organization/post_organization_login";
    const apiDetails = await resolveDetailsFromSwaggerUi(targetUrl);

    if (
      apiDetails &&
      apiDetails.method === "POST" &&
      apiDetails.mockResponse &&
      apiDetails.mockResponse.success === false &&
      apiDetails.mockResponse.token === "string"
    ) {
      console.log("  ✅ Swagger UI parser test passed.");
      passedTests++;
    } else {
      console.error("  ❌ Swagger UI parser test failed: details not matched.");
      console.error(apiDetails);
      failedTests++;
    }
  } catch (err) {
    console.error(`  ❌ Swagger UI parser test failed with exception: ${err.message}`);
    failedTests++;
  } finally {
    global.fetch = originalFetch;
  }

  // Cleanup
  await fs.remove(TEST_DIR);

  console.log("\n📊 Test execution complete:");
  console.log(`   Passed: ${passedTests}`);
  console.log(`   Failed: ${failedTests}`);

  if (failedTests > 0) {
    console.log("\n❌ Regression tests failed.");
    process.exit(1);
  } else {
    console.log("\n✨ All tests passed successfully!");
    process.exit(0);
  }
}

runTests();
