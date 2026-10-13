#!/usr/bin/env bash
# PEV secrets gate helper: exit 1 only on likely hardcoded secrets,
# exit 0 otherwise. Avoids head/|| true masking.
set -uo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
# Match assignments like password = "value", api_key: 'xxx' with length>=8,
# excluding types, interfaces, comments and test fixtures.
if grep -rEn '(password|passwd|secret|api_key|apikey)\s*[:=]\s*["'\''][^"'\'']{8,}["'\'']' --include='*.ts' worker/ | grep -v 'test' | grep -q .; then
  echo "Potential hardcoded secrets found:"
  grep -rEn '(password|passwd|secret|api_key|apikey)\s*[:=]\s*["'\''][^"'\'']{8,}["'\'']' --include='*.ts' worker/ | grep -v 'test' | head -n 20
  exit 1
fi
echo "No hardcoded secrets detected"
exit 0
