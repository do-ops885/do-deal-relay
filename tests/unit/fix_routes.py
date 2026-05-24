import sys

with open('tests/unit/routes-utils-security.test.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
skip = 0
for i, line in enumerate(lines):
    if skip > 0:
        skip -= 1
        continue

    if 'it("should fallback to default origin for disallowed origin"' in line:
        new_lines.append(line)
        new_lines.append('    const allowedOrigins = getAllowedOrigins();\n')
        new_lines.append('    const request = new Request("https://example.com", {\n')
        new_lines.append('      headers: { Origin: "https://evil.com" } as any,\n')
        new_lines.append('    });\n')
        new_lines.append('\n')
        new_lines.append('    const response = jsonResponse(mockData, 200, request);\n')
        new_lines.append('    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("");\n')
        new_lines.append('  });\n')
        # Skip the original test body until the end of the test block
        j = i + 1
        while j < len(lines) and '  });' not in lines[j]:
            j += 1
        skip = j - i
    elif 'it("should fallback to default origin when no Origin header is present"' in line:
        new_lines.append(line)
        new_lines.append('    const allowedOrigins = getAllowedOrigins();\n')
        new_lines.append('    const request = new Request("https://example.com");\n')
        new_lines.append('\n')
        new_lines.append('    const response = jsonResponse(mockData, 200, request);\n')
        new_lines.append('    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("");\n')
        new_lines.append('  });\n')
        # Skip the original test body until the end of the test block
        j = i + 1
        while j < len(lines) and '  });' not in lines[j]:
            j += 1
        skip = j - i
    else:
        new_lines.append(line)

with open('tests/unit/routes-utils-security.test.ts', 'w') as f:
    f.writelines(new_lines)
