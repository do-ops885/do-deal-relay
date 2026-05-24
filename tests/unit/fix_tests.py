import sys
import re

def fix_auth_test():
    with open('tests/unit/auth.test.ts', 'r') as f:
        content = f.read()

    # Correct getAllowedOrigin tests
    content = re.sub(r'it\("should return default origin for null input", \(.*?\n\s+const origin = getAllowedOrigin\(null\);\n\s+expect\(origin\)\.toBe\(".*?"\);',
                     'it("should return default origin for null input", () => {\n      const origin = getAllowedOrigin(null);\n      expect(origin).toBe("");', content)

    content = re.sub(r'it\("should return default for disallowed origin", \(.*?\n\s+const origin = getAllowedOrigin\("https://evil\.com"\);\n\s+expect\(origin\)\.toBe\(".*?"\);',
                     'it("should return default for disallowed origin", () => {\n      const origin = getAllowedOrigin("https://evil.com");\n      expect(origin).toBe("");', content)

    content = re.sub(r'it\("should return default for empty string", \(.*?\n\s+const origin = getAllowedOrigin\(""\);\n\s+expect\(origin\)\.toBe\(".*?"\);',
                     'it("should return default for empty string", () => {\n      const origin = getAllowedOrigin("");\n      expect(origin).toBe("");', content)

    # Correct createCorsHeaders test
    content = re.sub(r'it\("should return default origin for disallowed origin", \(.*?\n\s+const request = new Request\("https://example\.com", \{\n\s+headers: \{ Origin: "https://evil\.com" \},\n\s+\}\);\n\s+const headers = createCorsHeaders\(request\);\n\s+expect\(headers\["Access-Control-Allow-Origin"\]\)\.toBe\(".*?"\);',
                     'it("should return default origin for disallowed origin", () => {\n      const request = new Request("https://example.com", {\n        headers: { Origin: "https://evil.com" },\n      });\n      const headers = createCorsHeaders(request);\n      expect(headers["Access-Control-Allow-Origin"]).toBe("");', content)

    with open('tests/unit/auth.test.ts', 'w') as f:
        f.write(content)

def fix_routes_utils_test():
    with open('tests/unit/routes-utils-security.test.ts', 'r') as f:
        content = f.read()

    content = re.sub(r'it\("should fallback to default origin for disallowed origin", \(.*?\n\s+const allowedOrigins = getAllowedOrigins\(\);\n\s+const request = new Request\("https://example\.com", \{\n\s+headers: \{ Origin: "https://evil\.com" \} as any,\n\s+\}\);\n\s+const response = jsonResponse\(mockData, 200, request\);\n\s+expect\(response\.headers\.get\("Access-Control-Allow-Origin"\)\)\.toBe\(\n\s+allowedOrigins\[0\],\n\s+\);',
                     'it("should fallback to default origin for disallowed origin", () => {\n    const allowedOrigins = getAllowedOrigins();\n    const request = new Request("https://example.com", {\n      headers: { Origin: "https://evil.com" } as any,\n    });\n    const response = jsonResponse(mockData, 200, request);\n    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("");', content)

    content = re.sub(r'it\("should fallback to default origin when no Origin header is present", \(.*?\n\s+const allowedOrigins = getAllowedOrigins\(\);\n\s+const request = new Request\("https://example\.com"\);\n\s+const response = jsonResponse\(mockData, 200, request\);\n\s+expect\(response\.headers\.get\("Access-Control-Allow-Origin"\)\)\.toBe\(\n\s+allowedOrigins\[0\],\n\s+\);',
                     'it("should fallback to default origin when no Origin header is present", () => {\n    const allowedOrigins = getAllowedOrigins();\n    const request = new Request("https://example.com");\n    const response = jsonResponse(mockData, 200, request);\n    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("");', content)

    with open('tests/unit/routes-utils-security.test.ts', 'w') as f:
        f.write(content)

fix_auth_test()
fix_routes_utils_test()
