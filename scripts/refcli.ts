#!/usr/bin/env node

/**
 * refcli - CLI tool for managing referral codes in the do-deal-relay system
 *
 * This file is a thin wrapper that re-exports from the modular CLI structure.
 * All actual implementation is in scripts/cli/.
 *
 * Usage:
 *   refcli auth login --endpoint https://api.example.com --key <api_key>
 *   refcli codes add --code ABC123 --url https://example.com/invite/ABC123 --domain example.com
 *   refcli codes deactivate ABC123 --reason expired --replaced-by NEW456
 *   refcli research run --domain example.com --depth thorough
 */

export { main } from "./cli/index.js";
import { main } from "./cli/index.js";

// Run CLI
main();
