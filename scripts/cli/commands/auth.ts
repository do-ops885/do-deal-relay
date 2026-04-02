/**
 * Authentication Commands
 * CLI commands for authentication management
 */

import { ParsedArgs } from "../types.js";
import { config, setApiKey, setEndpoint } from "../config.js";
import { apiRequest, formatOutput } from "../utils.js";

/**
 * Handle auth commands
 */
export async function handleAuth(args: ParsedArgs): Promise<void> {
  switch (args.subcommand) {
    case "login": {
      const endpoint = (args.flags.endpoint as string) || config.endpoint;
      const apiKey = (args.flags.key as string) || process.env.REFCLI_API_KEY;

      if (!apiKey) {
        console.error(
          "Error: API key required. Use --key or set REFCLI_API_KEY",
        );
        process.exit(1);
      }

      // Test connection
      try {
        setEndpoint(endpoint);
        setApiKey(apiKey);
        await apiRequest("GET", "/health");
        console.log(`[OK] Authenticated to ${endpoint}`);
      } catch (error) {
        console.error(
          `[FAIL] Authentication failed: ${(error as Error).message}`,
        );
        process.exit(1);
      }
      break;
    }

    case "logout": {
      setApiKey(undefined);
      console.log("[OK] Logged out");
      break;
    }

    case "whoami": {
      console.log(`Endpoint: ${config.endpoint}`);
      console.log(`Authenticated: ${config.apiKey ? "Yes" : "No"}`);
      break;
    }

    default:
      console.log("Usage: refcli auth [login|logout|whoami]");
  }
}
