/**
 * refcli - CLI tool for managing referral codes in the do-deal-relay system
 *
 * This is the main entry point that delegates to command handlers
 */

import { ParsedArgs } from "./types.js";
import { parseArgs, formatOutput } from "./utils.js";
import { config } from "./config.js";
import { handleAuth } from "./commands/auth.js";
import { handleCodes } from "./commands/codes.js";
import { handleResearch } from "./commands/research.js";
import { handleSystem } from "./commands/system.js";

/**
 * Show help message
 */
function showHelp(): void {
  console.log("");
  console.log("refcli - CLI tool for managing referral codes");
  console.log("");
  console.log("USAGE:");
  console.log("  refcli [command] [subcommand] [options]");
  console.log("");
  console.log("COMMANDS:");
  console.log("  auth        Authentication management");
  console.log("    login     --endpoint <url> --key <api_key>");
  console.log("    logout");
  console.log("    whoami");
  console.log("");
  console.log("  codes       Referral code management");
  console.log(
    "    list      [--status active|inactive] [--domain <domain>] [--limit <n>]",
  );
  console.log("    add       --code <code> --url <url> --domain <domain>");
  console.log(
    "              [--title <title>] [--reward-type <type>] [--reward-value <val>]",
  );
  console.log("    smart-add <url>   Auto-parse URL to extract code/domain");
  console.log("    get       <code>");
  console.log(
    "    deactivate <code> --reason <reason> [--replaced-by <new_code>]",
  );
  console.log("    reactivate <code>");
  console.log("");
  console.log("  research    Web research for referral codes");
  console.log("    run       --domain <domain> [--depth quick|thorough|deep]");
  console.log("    results   --domain <domain>");
  console.log("");
  console.log("  system      System operations");
  console.log("    health    Check system health");
  console.log("    metrics   View system metrics");
  console.log("");
  console.log("GLOBAL OPTIONS:");
  console.log(
    "  --output    Output format: table, json, csv, yaml (default: table)",
  );
  console.log("  --help      Show this help message");
  console.log("");
  console.log("EXAMPLES:");
  console.log(
    "  refcli auth login --endpoint https://api.example.com --key my-api-key",
  );
  console.log(
    "  refcli codes add --code ABC123 --url https://example.com/invite/ABC123 --domain example.com",
  );
  console.log(
    "  refcli codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869",
  );
  console.log("  refcli codes list --status active --domain example.com");
  console.log(
    "  refcli codes deactivate ABC123 --reason expired --replaced-by NEW456",
  );
  console.log("  refcli research run --domain example.com --depth thorough");
}

/**
 * Main entry point
 */
export async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  // Show help
  if (args.flags.help || args.flags.h) {
    showHelp();
    return;
  }

  // Route to command handler
  try {
    switch (args.command) {
      case "auth":
        await handleAuth(args);
        break;
      case "codes":
        await handleCodes(args);
        break;
      case "research":
        await handleResearch(args);
        break;
      case "system":
        await handleSystem(args);
        break;
      default:
        console.log("Usage: refcli [auth|codes|research|system] [--help]");
        process.exit(1);
    }
  } catch (error) {
    console.error("Error: " + (error as Error).message);
    process.exit(1);
  }
}

// Run CLI
main();
