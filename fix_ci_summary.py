import sys

with open('.github/workflows/ci.yml', 'r') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if 'Report Status' in line:
        new_lines.append(line)
        # Skip the next few lines and replace with static version
        skip = True
        new_lines.append('        run: |\n')
        new_lines.append('          {\n')
        new_lines.append('            echo "## CI Results"\n')
        new_lines.append('            echo "| Job | Status |"\n')
        new_lines.append('            echo "|-----|--------|"\n')
        new_lines.append('            echo "| Type Check | ${{ needs.lint.result }} |"\n')
        new_lines.append('            echo "| Format Check | ${{ needs.format.result }} |"\n')
        new_lines.append('            echo "| Docs Validation | ${{ needs.docs.result }} |"\n')
        new_lines.append('            echo "| Validation Gates | ${{ needs.validate-codes.result }} |"\n')
        new_lines.append('            echo "| Unit Tests | ${{ needs.test.result }} |"\n')
        new_lines.append('            echo "| E2E Tests | ${{ needs.test-e2e.result }} |"\n')
        new_lines.append('            echo "| Smoke Tests | ${{ needs.smoke-test.result }} |"\n')
        new_lines.append('            echo "| Security Scan | ${{ needs.security-scan.result }} |"\n')
        new_lines.append('            echo "| Build | ${{ needs.build.result }} |"\n')
        new_lines.append('            echo ""\n')
        new_lines.append('          } >> "$GITHUB_STEP_SUMMARY"\n')
        new_lines.append('\n')
        new_lines.append('          FAILED=0\n')
        new_lines.append('          for result in "${{ needs.lint.result }}" "${{ needs.format.result }}" "${{ needs.validate-codes.result }}" "${{ needs.test.result }}" "${{ needs.test-e2e.result }}" "${{ needs.smoke-test.result }}" "${{ needs.security-scan.result }}" "${{ needs.build.result }}"; do\n')
        new_lines.append('            if [ "$result" = "failure" ]; then\n')
        new_lines.append('              FAILED=1\n')
        new_lines.append('            fi\n')
        new_lines.append('          done\n')
        new_lines.append('\n')
        new_lines.append('          if [ "$FAILED" = "1" ]; then\n')
        new_lines.append('            echo "CI Failed - Check individual jobs for details" >> "$GITHUB_STEP_SUMMARY"\n')
        new_lines.append('            exit 1\n')
        new_lines.append('          else\n')
        new_lines.append('            echo "All CI checks passed!" >> "$GITHUB_STEP_SUMMARY"\n')
        new_lines.append('          fi\n')
        continue

    if skip:
        if i + 1 < len(lines) and 'if: always()' in lines[i+1]: # Stop skip at next step/block
             skip = False
        continue

    new_lines.append(line)

with open('.github/workflows/ci.yml', 'w') as f:
    f.writelines(new_lines)
