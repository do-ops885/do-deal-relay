#!/bin/bash
# doctor.sh - Diagnoses the agent environment and repo state.
set -e

echo "--- [Doctor] Checking repository health ---"

# 1. Check for node_modules
if [ ! -d "node_modules" ]; then
  echo "[-] node_modules missing. Run 'npm install'."
else
  echo "[+] node_modules present."
fi

# 2. Check for skill symlinks
echo "[?] Checking skill symlinks..."
MISSING_SYMLINKS=0
for tool in .claude .qwen .gemini; do
  if [ -d "$tool/skills" ]; then
    echo "[+] $tool/skills directory exists."
  else
    echo "[-] $tool/skills directory missing. Run './scripts/setup-skills.sh'."
    MISSING_SYMLINKS=1
  fi
done

# 3. Check for pre-commit hook
if [ -f ".git/hooks/pre-commit" ]; then
  echo "[+] Git pre-commit hook installed."
else
  echo "[-] Git pre-commit hook missing. Run './scripts/bootstrap.sh'."
fi

# 4. Check for CI status artifact
if [ -f ".github/ci-status/ci-status.json" ]; then
  echo "[+] CI status artifact found."
  cat .github/ci-status/ci-status.json
else
  echo "[-] CI status artifact (.github/ci-status/ci-status.json) not found."
fi

# 5. Check for GOAP state
if [ -f "plans/GOAP_STATE.md" ]; then
  echo "[+] plans/GOAP_STATE.md found."
else
  echo "[-] plans/GOAP_STATE.md missing."
fi

echo "--- [Doctor] Diagnosis complete ---"
