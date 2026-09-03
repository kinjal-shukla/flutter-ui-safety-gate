import fs from "fs-extra";
import path from "path";
import { glob } from "glob";
import vm from "vm";

/**
 * Searches the workspace for Swagger/OpenAPI files or Postman collections,
 * parses them, and extracts request details (method, headers, body) for a given endpoint.
 * 
 * @param {string} urlString The target API endpoint URL (e.g., "http://localhost:3000/api/login").
 * @param {string} projectRoot The root directory of the workspace.
 * @returns {Promise<{method?: string, headers?: Record<string, string>, body?: string, mockResponse?: any}|null>}
 */
export async function discoverApiDetails(urlString, projectRoot = ".") {
  try {
    const parsedUrl = new URL(urlString);
    const targetPath = parsedUrl.pathname; // e.g. "/api/login"
    
    // 1. Scan for Swagger/OpenAPI files
    const swaggerFiles = await glob("**/@(swagger|openapi|api-docs).json", {
      cwd: projectRoot,
      ignore: "**/node_modules/**",
      absolute: true
    });

    for (const file of swaggerFiles) {
      try {
        const doc = await fs.readJson(file);
        if (doc.paths) {
          // Check for exact path match or suffix match
          for (const [routePath, methods] of Object.entries(doc.paths)) {
            if (routePath === targetPath || targetPath.endsWith(routePath)) {
              // Get the first available HTTP method (usually only one or two like POST/GET)
              const method = Object.keys(methods).find(m => ["get", "post", "put", "delete", "patch"].includes(m.toLowerCase()));
              if (method) {
                const methodObj = methods[method];
                const result = {
                  method: method.toUpperCase(),
                  headers: { "Content-Type": "application/json" }
                };

                // Try to construct a mock body from Swagger requestBody schema
                if (methodObj.requestBody?.content?.["application/json"]?.schema) {
                  const schema = methodObj.requestBody.content["application/json"].schema;
                  result.body = JSON.stringify(generateMockFromSchema(schema));
                }

                // Try to construct mock response from success response schema
                const successResponse = methodObj.responses?.["200"] || methodObj.responses?.["201"];
                if (successResponse?.content?.["application/json"]?.schema) {
                  const schema = successResponse.content["application/json"].schema;
                  result.mockResponse = generateMockFromSchema(schema);
                }

                return result;
              }
            }
          }
        }
      } catch (err) {
        // Continue scanning other files if one fails to parse
      }
    }

    // 2. Scan for Postman Collections
    const postmanFiles = await glob("**/*.postman_collection.json", {
      cwd: projectRoot,
      ignore: "**/node_modules/**",
      absolute: true
    });

    for (const file of postmanFiles) {
      try {
        const doc = await fs.readJson(file);
        const match = findPostmanItem(doc.item || [], targetPath);
        if (match) {
          const req = match.request;
          const result = {
            method: (req.method || "GET").toUpperCase(),
            headers: {}
          };

          // Extract headers
          if (Array.isArray(req.header)) {
            for (const h of req.header) {
              if (h.key && h.value && !h.disabled) {
                result.headers[h.key] = h.value;
              }
            }
          }

          // Extract body
          if (req.body && req.body.mode === "raw" && req.body.raw) {
            result.body = req.body.raw;
          }

          // Extract mock response if saved in Postman item
          if (Array.isArray(match.response) && match.response.length > 0) {
            const successResp = match.response.find(r => r.code === 200 || r.code === 201);
            if (successResp && successResp.body) {
              try {
                result.mockResponse = JSON.parse(successResp.body);
              } catch (e) {
                // If body is not JSON, leave mockResponse undefined
              }
            }
          }

          return result;
        }
      } catch (err) {
        // Continue scanning
      }
    }

    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Recursively searches a Postman collection item tree for a matching request path.
 */
function findPostmanItem(items, targetPath) {
  for (const item of items) {
    if (item.request) {
      const url = item.request.url;
      let urlPath = "";
      if (typeof url === "string") {
        try {
          urlPath = new URL(url).pathname;
        } catch (e) {
          urlPath = url;
        }
      } else if (url && Array.isArray(url.path)) {
        urlPath = "/" + url.path.join("/");
      }

      if (urlPath === targetPath || targetPath.endsWith(urlPath)) {
        return item;
      }
    }
    if (Array.isArray(item.item)) {
      const nestedMatch = findPostmanItem(item.item, targetPath);
      if (nestedMatch) return nestedMatch;
    }
  }
  return null;
}

/**
 * Generates a simple mock JSON object from a Swagger/OpenAPI schema.
 */
function generateMockFromSchema(schema) {
  if (schema.example) return schema.example;
  if (schema.default) return schema.default;

  if (schema.type === "object" && schema.properties) {
    const obj = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      obj[key] = generateMockFromSchema(prop);
    }
    return obj;
  }
  if (schema.type === "array" && schema.items) {
    return [generateMockFromSchema(schema.items)];
  }
  if (schema.type === "string") {
    if (schema.format === "date-time") return new Date().toISOString();
    return "string";
  }
  if (schema.type === "integer" || schema.type === "number") return 0;
  if (schema.type === "boolean") return false;

  return null;
}

/**
 * Parses and extracts API request details from a Swagger UI page URL.
 * Probes the backend for JSON/JS specs, matches the hash operation, and resolves schemas.
 * 
 * @param {string} urlString The Swagger UI documentation URL.
 * @returns {Promise<{method: string, headers: Record<string, string>, body?: string, mockResponse?: any}|null>}
 */
export async function resolveDetailsFromSwaggerUi(urlString) {
  try {
    const parsedUrl = new URL(urlString);
    if (!parsedUrl.hash || !parsedUrl.hash.startsWith("#/")) {
      return null;
    }

    const hashParts = parsedUrl.hash.split("/");
    const operationId = hashParts[hashParts.length - 1];

    const baseDocsUrl = urlString.substring(0, urlString.indexOf("#"));
    const initJsUrl = baseDocsUrl.endsWith("/") ? `${baseDocsUrl}swagger-ui-init.js` : `${baseDocsUrl}/swagger-ui-init.js`;
    
    let spec = null;
    try {
      const response = await fetch(initJsUrl);
      if (response.ok) {
        const jsText = await response.text();
        spec = extractJsonFromJs(jsText);
      }
    } catch (e) {
      // ignore
    }

    if (!spec) {
      const swaggerJsonUrl = baseDocsUrl.endsWith("/") ? `${baseDocsUrl}swagger.json` : `${baseDocsUrl}/swagger.json`;
      try {
        const response = await fetch(swaggerJsonUrl);
        if (response.ok) {
          spec = await response.json();
        }
      } catch (e) {
        // ignore
      }
    }

    if (!spec) {
      const openapiJsonUrl = baseDocsUrl.endsWith("/") ? `${baseDocsUrl}openapi.json` : `${baseDocsUrl}/openapi.json`;
      try {
        const response = await fetch(openapiJsonUrl);
        if (response.ok) {
          spec = await response.json();
        }
      } catch (e) {
        // ignore
      }
    }

    if (!spec) return null;

    for (const [routePath, methods] of Object.entries(spec.paths)) {
      for (const [method, details] of Object.entries(methods)) {
        if (matchSwaggerPath(routePath, method, details, operationId)) {
          const result = {
            method: method.toUpperCase(),
            headers: { "Content-Type": "application/json" }
          };

          if (details.requestBody?.content?.["application/json"]?.schema) {
            const schema = resolveSchemaRefs(details.requestBody.content["application/json"].schema, spec);
            result.body = JSON.stringify(generateMockFromSchema(schema));
          }

          const successResponse = details.responses?.["200"] || details.responses?.["201"];
          if (successResponse?.content?.["application/json"]?.schema) {
            const schema = resolveSchemaRefs(successResponse.content["application/json"].schema, spec);
            result.mockResponse = generateMockFromSchema(schema);
          }

          return result;
        }
      }
    }

    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Matches a route path and method against a target operationId, supporting
 * both explicit OpenAPI operationIds and auto-generated Swagger UI hashes.
 */
function matchSwaggerPath(routePath, method, details, targetOperationId) {
  if (details.operationId === targetOperationId) return true;
  if (details.operationId?.toLowerCase() === targetOperationId.toLowerCase()) return true;
  if (routePath.endsWith(targetOperationId)) return true;

  const normalizedTarget = targetOperationId.toLowerCase();
  const normalizedMethod = method.toLowerCase();

  let cleanTarget = normalizedTarget;
  if (normalizedTarget.startsWith(`${normalizedMethod}_`)) {
    cleanTarget = normalizedTarget.substring(normalizedMethod.length + 1);
  }

  cleanTarget = cleanTarget.replace(new RegExp(`_${normalizedMethod}_`, 'g'), '_');

  const routeUnderscored = routePath.replace(/^\//, '').replace(/\//g, '_').toLowerCase();

  if (routeUnderscored === cleanTarget || routeUnderscored.endsWith(cleanTarget) || cleanTarget.endsWith(routeUnderscored)) {
    return true;
  }

  return false;
}

function resolveSchemaRefs(schema, spec) {
  if (!schema) return schema;
  if (schema.$ref) {
    const pathParts = schema.$ref.replace("#/", "").split("/");
    let current = spec;
    for (const part of pathParts) {
      current = current[part];
      if (!current) break;
    }
    return resolveSchemaRefs(current, spec);
  }
  if (schema.type === "object" && schema.properties) {
    const resolvedProps = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      resolvedProps[key] = resolveSchemaRefs(prop, spec);
    }
    return { ...schema, properties: resolvedProps };
  }
  if (schema.type === "array" && schema.items) {
    return { ...schema, items: resolveSchemaRefs(schema.items, spec) };
  }
  return schema;
}

function extractJsonFromJs(jsContent) {
  try {
    const sandbox = {
      window: {
        onload: null,
        location: {
          search: "",
          origin: ""
        }
      },
      SwaggerUIBundle: Object.assign(() => ({}), {
        presets: {
          apis: {}
        },
        plugins: {
          DownloadUrl: {}
        }
      }),
      SwaggerUIStandalonePreset: () => ({})
    };
    
    let capturedSpec = null;
    const originalUIBundle = sandbox.SwaggerUIBundle;
    sandbox.SwaggerUIBundle = Object.assign((config) => {
      if (config && config.spec) {
        capturedSpec = config.spec;
      } else if (config && config.swaggerDoc) {
        capturedSpec = config.swaggerDoc;
      }
      return {};
    }, originalUIBundle);

    vm.createContext(sandbox);
    vm.runInContext(jsContent, sandbox);
    if (typeof sandbox.window.onload === "function") {
      sandbox.window.onload();
    }
    if (capturedSpec) return capturedSpec;
  } catch (e) {
    // If running onload fails, try extracting it by executing options assignment directly
    try {
      const optionsIndex = jsContent.search(/options\s*=\s*\{/);
      if (optionsIndex !== -1) {
        const scriptCode = jsContent.substring(optionsIndex);
        const sandbox2 = { SwaggerUIBundle: () => ({}) };
        vm.createContext(sandbox2);
        vm.runInContext(scriptCode, sandbox2);
        if (sandbox2.options?.swaggerDoc) return sandbox2.options.swaggerDoc;
        if (sandbox2.options?.spec) return sandbox2.options.spec;
      }
    } catch (err) {
      // ignore
    }
  }
  return null;
}
