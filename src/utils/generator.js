import path from "path";

/**
 * Recursively generates Dart model classes from a JSON object.
 * Supports nesting, lists, primitives, and maps.
 * 
 * @param {Object} rootObj The parsed JSON object.
 * @param {string} rootClassName The name of the root class to generate.
 * @returns {string} The formatted Dart source code.
 */
export function generateDartClasses(rootObj, rootClassName) {
  const classesToGenerate = []; // Array of { name, fields: [ { jsonKey, fieldName, type } ] }
  
  function inferType(val, keyName) {
    if (val === null || val === undefined) return "dynamic";
    if (typeof val === "string") return "String";
    if (typeof val === "boolean") return "bool";
    if (typeof val === "number") {
      return Number.isInteger(val) ? "int" : "double";
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return "List<dynamic>";
      const firstItemType = inferType(val[0], keyName);
      return `List<${firstItemType}>`;
    }
    if (typeof val === "object") {
      const className = capitalize(keyName);
      generateClass(val, className);
      return className;
    }
    return "dynamic";
  }

  function capitalize(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function toCamelCase(str) {
    return str.replace(/([-_][a-z])/ig, ($1) => {
      return $1.toUpperCase().replace('-', '').replace('_', '');
    });
  }

  function generateClass(obj, className) {
    if (classesToGenerate.some(c => c.name === className)) return;

    const fields = [];
    for (const [key, value] of Object.entries(obj)) {
      const fieldType = inferType(value, key);
      fields.push({
        jsonKey: key,
        fieldName: toCamelCase(key),
        type: fieldType
      });
    }

    classesToGenerate.push({ name: className, fields });
  }

  // Start building class hierarchy
  generateClass(rootObj, rootClassName);

  // Output Dart string builder
  let dartCode = "";
  for (const c of classesToGenerate) {
    dartCode += `class ${c.name} {\n`;
    
    // Properties
    for (const field of c.fields) {
      dartCode += `  final ${field.type}? ${field.fieldName};\n`;
    }
    dartCode += `\n`;

    // Constructor
    dartCode += `  const ${c.name}({\n`;
    for (const field of c.fields) {
      dartCode += `    this.${field.fieldName},\n`;
    }
    dartCode += `  });\n\n`;

    // fromJson factory
    dartCode += `  factory ${c.name}.fromJson(Map<String, dynamic> json) {\n`;
    dartCode += `    return ${c.name}(\n`;
    for (const field of c.fields) {
      const k = field.jsonKey;
      const fn = field.fieldName;
      const t = field.type;
      
      if (t.startsWith("List<")) {
        const innerType = t.substring(5, t.length - 1);
        if (["String", "int", "double", "bool", "dynamic"].includes(innerType)) {
          dartCode += `      ${fn}: json['${k}'] != null ? List<${innerType}>.from(json['${k}']) : null,\n`;
        } else {
          dartCode += `      ${fn}: json['${k}'] != null\n`;
          dartCode += `          ? List<${innerType}>.from(json['${k}'].map((x) => ${innerType}.fromJson(x as Map<String, dynamic>)))\n`;
          dartCode += `          : null,\n`;
        }
      } else if (!["String", "int", "double", "bool", "dynamic"].includes(t)) {
        dartCode += `      ${fn}: json['${k}'] != null ? ${t}.fromJson(json['${k}'] as Map<String, dynamic>) : null,\n`;
      } else {
        dartCode += `      ${fn}: json['${k}'] as ${t}?,\n`;
      }
    }
    dartCode += `    );\n`;
    dartCode += `  }\n\n`;

    // toJson method
    dartCode += `  Map<String, dynamic> toJson() {\n`;
    dartCode += `    return <String, dynamic>{\n`;
    for (const field of c.fields) {
      const k = field.jsonKey;
      const fn = field.fieldName;
      const t = field.type;
      if (t.startsWith("List<")) {
        const innerType = t.substring(5, t.length - 1);
        if (["String", "int", "double", "bool", "dynamic"].includes(innerType)) {
          dartCode += `      '${k}': ${fn},\n`;
        } else {
          dartCode += `      '${k}': ${fn} != null ? List<dynamic>.from(${fn}!.map((x) => x.toJson())) : null,\n`;
        }
      } else if (!["String", "int", "double", "bool", "dynamic"].includes(t)) {
        dartCode += `      '${k}': ${fn}?.toJson(),\n`;
      } else {
        dartCode += `      '${k}': ${fn},\n`;
      }
    }
    dartCode += `    };\n`;
    dartCode += `  }\n`;

    dartCode += `}\n\n`;
  }

  return dartCode.trim();
}
