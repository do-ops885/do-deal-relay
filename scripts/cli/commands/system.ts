/**
 * System Commands
 * CLI commands for system operations
 */

import { ParsedArgs } from "../types.js";
import { config } from "../config.js";
import { apiRequest, formatOutput } from "../utils.js";

/**
 * Handle system commands
 */
export async function handleSystem(args: ParsedArgs): Promise<void> {
  const output = (args.flags.output as string) || config.defaultOutput;

  switch (args.subcommand) {
    case "health": {
      const data = await apiRequest("GET", "/health");
      console.log(formatOutput(data, output));
      break;
    }

    case "metrics": {
      const data = await apiRequest("GET", "/metrics");
      console.log(data);
      break;
    }

    default:
      console.log("Usage: refcli system [health|metrics]");
  }
}
