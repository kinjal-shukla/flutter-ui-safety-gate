export const RULES = {
  INVALID_EXPANDED_PARENT: {
    id: "INVALID_EXPANDED_PARENT",
    severity: "BLOCKER",
    category: "layout",
    description: "Expanded or Flexible widget is not placed directly inside a Row, Column, or Flex.",
    recommendation: "Ensure Expanded/Flexible is a direct child of a Flex container (Row, Column, or Flex). If you need spacing or padding around it, place the Padding/Container INSIDE the Expanded widget, or use SizedBox for spacing."
  },
  FLEX_CHILD_VIEWPORT: {
    id: "FLEX_CHILD_VIEWPORT",
    severity: "BLOCKER",
    category: "layout",
    description: "A scrollable viewport (ListView, GridView, SingleChildScrollView) inside a Flex container (Column, Row) must be constrained.",
    recommendation: "Wrap the scrollable widget in Expanded or Flexible, or set shrinkWrap: true and physics: const NeverScrollableScrollPhysics() on the scrollable."
  },
  TEXT_OVERFLOW_IN_FLEX: {
    id: "TEXT_OVERFLOW_IN_FLEX",
    severity: "WARNING",
    category: "layout",
    description: "Text or RichText widget inside a Row/Flex does not handle overflows and may exceed screen boundaries.",
    recommendation: "Wrap the Text widget in Expanded/Flexible, or set its 'overflow' property (e.g., overflow: TextOverflow.ellipsis)."
  },
  HARDCODED_SIZES: {
    id: "HARDCODED_SIZES",
    severity: "WARNING",
    category: "layout",
    description: "Large hardcoded screen dimensions are used, which breaks responsive layouts.",
    recommendation: "Avoid magic dimension numbers (e.g. width: 375, height: 812). Use MediaQuery, LayoutBuilder, FractionallySizedBox, or responsive layout utilities instead."
  },
  NESTED_VIEWPORTS: {
    id: "NESTED_VIEWPORTS",
    severity: "BLOCKER",
    category: "layout",
    description: "Nested viewports (e.g., ListView inside SingleChildScrollView or another ListView) without shrinkWrap and disabled physics.",
    recommendation: "Set shrinkWrap: true and physics: const NeverScrollableScrollPhysics() on the inner scrollable widget."
  },
  FORCE_UNWRAP: {
    id: "FORCE_UNWRAP",
    severity: "BLOCKER",
    category: "null-safety",
    description: "Force-unwrap operator '!' used on a nullable value, which can cause runtime NullThrownErrors.",
    recommendation: "Use null-coalescing (value ?? default), conditional access (value?.member), or check for null explicitly before usage."
  },
  UNSAFE_CAST: {
    id: "UNSAFE_CAST",
    severity: "BLOCKER",
    category: "null-safety",
    description: "Unsafe type casting using the 'as' keyword, which throws TypeError at runtime if the cast fails.",
    recommendation: "Check the type first using 'is' (e.g., if (x is String)), or use dynamic parsing safe-guards."
  },
  UNINITIALIZED_LATE_VAR: {
    id: "UNINITIALIZED_LATE_VAR",
    severity: "WARNING",
    category: "null-safety",
    description: "Late variable declared without initial value, presenting a risk of LateError if read before assignment.",
    recommendation: "Initialize the late variable on declaration, or ensure it is guaranteed to be initialized in constructors or initState. Alternatively, make the variable nullable."
  },
  UNDISPOSED_CONTROLLER: {
    id: "UNDISPOSED_CONTROLLER",
    severity: "BLOCKER",
    category: "state-management",
    description: "A controller (e.g. TextEditingController, ScrollController, AnimationController) is defined in a State class but not disposed in dispose().",
    recommendation: "Override the dispose() method in the State class and call [controllerName].dispose() to release resources and prevent memory leaks."
  },
  SETSTATE_IN_SCROLL_LISTENER: {
    id: "SETSTATE_IN_SCROLL_LISTENER",
    severity: "WARNING",
    category: "performance",
    description: "Calling setState() directly inside a scroll/animation listener callback causes excessive rebuilds.",
    recommendation: "Avoid calling setState directly inside listeners. Use ValueNotifier, AnimatedBuilder, or debounce/throttle updates to optimize layout performance."
  },
  MISSING_CONST_CONSTRUCTOR: {
    id: "MISSING_CONST_CONSTRUCTOR",
    severity: "WARNING",
    category: "performance",
    description: "Missing 'const' keyword on widget instantiations that only use constant/literal arguments.",
    recommendation: "Prefix widget instantiation with the 'const' keyword (e.g. const SizedBox(height: 10)) to allow Flutter to reuse widget instances and speed up rebuilds."
  },
  DEEP_WIDGET_TREE: {
    id: "DEEP_WIDGET_TREE",
    severity: "WARNING",
    category: "performance",
    description: "Deeply nested widget tree (depth exceeds 8 levels) inside a single build method.",
    recommendation: "Refactor large build methods by extracting deep widget trees into separate stateless or stateful widgets."
  },
  MISSING_ASSET_DECLARATION: {
    id: "MISSING_ASSET_DECLARATION",
    severity: "BLOCKER",
    category: "assets",
    description: "Asset path is referenced in code but not declared in pubspec.yaml.",
    recommendation: "Register the asset path under the 'assets:' section in your project's pubspec.yaml file."
  },
  MISSING_ASSET_FILE: {
    id: "MISSING_ASSET_FILE",
    severity: "BLOCKER",
    category: "assets",
    description: "Asset file referenced in code does not exist on disk.",
    recommendation: "Add the missing asset file at the expected location in your project directory."
  },
  HARDCODED_UI_STRING: {
    id: "HARDCODED_UI_STRING",
    severity: "WARNING",
    category: "localization",
    description: "Hardcoded user-facing text string is used directly in a widget.",
    recommendation: "Extract the hardcoded string to localization keys (e.g. AppLocalizations.of(context).key) to support multiple languages."
  },
  CONTROLLER_INSTANTIATED_IN_BUILD: {
    id: "CONTROLLER_INSTANTIATED_IN_BUILD",
    severity: "WARNING",
    category: "performance",
    description: "Instantiating a controller (like TextEditingController) inside build() resets its state on every rebuild.",
    recommendation: "Declare the controller as a class field of a StatefulWidget State class, and dispose of it in dispose()."
  },
  ASYNC_AWAIT_UNMOUNTED: {
    id: "ASYNC_AWAIT_UNMOUNTED",
    severity: "WARNING",
    category: "performance",
    description: "Calling setState() after await without checking if widget is still mounted.",
    recommendation: "Always check if (mounted) before calling setState() or accessing BuildContext after an asynchronous await operation."
  },
  STATELESS_CANDIDATE: {
    id: "STATELESS_CANDIDATE",
    severity: "WARNING",
    category: "performance",
    description: "StatefulWidget never calls setState() and can be refactored to a StatelessWidget.",
    recommendation: "Convert this StatefulWidget into a StatelessWidget to simplify code and save memory."
  },
  AVOID_PRINT: {
    id: "AVOID_PRINT",
    severity: "WARNING",
    category: "production",
    description: "Avoid using raw print() statements which leak debug logs in release builds.",
    recommendation: "Use debugPrint() or a structured logging library, or wrap the print statement in a check for kDebugMode."
  },
  UNDISPOSED_FOCUS_NODE: {
    id: "UNDISPOSED_FOCUS_NODE",
    severity: "BLOCKER",
    category: "state-management",
    description: "FocusNode is declared but never disposed of.",
    recommendation: "Override the dispose() method in the State class and call [focusNodeName].dispose() to release resources."
  },
  UNCLOSED_STREAM_CONTROLLER: {
    id: "UNCLOSED_STREAM_CONTROLLER",
    severity: "BLOCKER",
    category: "state-management",
    description: "StreamController is declared but never closed.",
    recommendation: "Override the dispose() method in the State class and call [streamControllerName].close() to release resources."
  },
  HARDCODED_THEME_VALUES: {
    id: "HARDCODED_THEME_VALUES",
    severity: "WARNING",
    category: "styling",
    description: "Hardcoded colors or TextStyle used directly instead of Theme values.",
    recommendation: "Use Theme.of(context).colorScheme or Theme.of(context).textTheme to support dynamic scaling and Dark Mode."
  },
  MISSING_WIDGET_KEY: {
    id: "MISSING_WIDGET_KEY",
    severity: "WARNING",
    category: "performance",
    description: "Custom widget class is missing the 'key' parameter in its constructor.",
    recommendation: "Add key parameter to the constructor (e.g. const MyWidget({super.key})) to ensure Flutter tracks identities properly."
  },
  UNUSED_IMPORTS_VARIABLES: {
    id: "UNUSED_IMPORTS_VARIABLES",
    severity: "WARNING",
    category: "cleanliness",
    description: "Unused library import or unused private field detected.",
    recommendation: "Remove the unused import statement or the unused private field to clean up the code."
  },
  MEDIA_QUERY_OVERHEAD: {
    id: "MEDIA_QUERY_OVERHEAD",
    severity: "WARNING",
    category: "performance",
    description: "MediaQuery.of(context) called directly inside leaf widgets.",
    recommendation: "Use LayoutBuilder or constraints instead, to avoid rebuilding this entire subtree on minor screen updates (like keyboard opening)."
  },
  POSITIONED_OUTSIDE_STACK: {
    id: "POSITIONED_OUTSIDE_STACK",
    severity: "BLOCKER",
    category: "layout",
    description: "Positioned widget is used outside of a Stack container.",
    recommendation: "Ensure Positioned is a direct child of a Stack widget. Placing it outside Stack causes a ParentDataWidget runtime exception."
  },
  SPACER_OUTSIDE_FLEX: {
    id: "SPACER_OUTSIDE_FLEX",
    severity: "BLOCKER",
    category: "layout",
    description: "Spacer widget is used outside of a Column, Row, or Flex container.",
    recommendation: "Ensure Spacer is placed inside a Flex container (Row, Column, or Flex) to adjust spacing between child widgets."
  },
  SPACER_INSIDE_SCROLLVIEW: {
    id: "SPACER_INSIDE_SCROLLVIEW",
    severity: "BLOCKER",
    category: "layout",
    description: "Spacer widget is placed inside a scroll view (like ListView or SingleChildScrollView).",
    recommendation: "Do not use Spacer inside scroll views. Since scroll views have unbounded layout bounds, a Spacer cannot calculate height/width. Use SizedBox for fixed spacing instead."
  },
  UNSAFE_NAVIGATOR_POP: {
    id: "UNSAFE_NAVIGATOR_POP",
    severity: "BLOCKER",
    category: "layout",
    description: "Navigator.pop or Navigator.of(context).pop is called after an async gap without a mounted check.",
    recommendation: "Add an 'if (!mounted) return;' check immediately before calling pop() after any await statement."
  },
  INFINITE_ASPECT_RATIO: {
    id: "INFINITE_ASPECT_RATIO",
    severity: "BLOCKER",
    category: "layout",
    description: "AspectRatio widget is placed directly inside an unconstrained scroll view.",
    recommendation: "Wrap AspectRatio in a BoxConstraints/SizedBox/Container with explicit dimensions when nesting inside scroll views."
  }
};
