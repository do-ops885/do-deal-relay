/**
 * Research Commands
 * CLI commands for web research
 */

import {
  ParsedArgs,
  ResearchResponse,
  ResearchResultsResponse,
} from "../types.js";
import { config } from "../config.js";
import { apiRequest, formatOutput } from "../utils.js";

/**
 * Handle research commands
 */
export async function handleResearch(args: ParsedArgs): Promise<void> {
  const output = (args.flags.output as string) || config.defaultOutput;

  switch (args.subcommand) {
    case "run": {
      const domain = args.flags.domain as string;
      const query = (args.flags.query as string) || `${domain} referral code`;
      const depth = (args.flags.depth as string) || "thorough";

      if (!domain) {
        console.error("Error: --domain is required");
        process.exit(1);
      }

      console.log(`Researching referral codes for ${domain}...`);

      const body = {
        query,
        domain,
        depth,
        sources: ["all"],
        max_results: 20,
      };

      const data = (await apiRequest(
        "POST",
        "/api/research",
        body,
      )) as ResearchResponse;

      if (data.success) {
        console.log(`[OK] Research completed`);
        console.log(`  Discovered: ${data.discovered_codes} codes`);
        console.log(`  Stored: ${data.stored_referrals} referrals`);

        if (args.flags.verbose) {
          console.log("\nMetadata:");
          console.log(formatOutput(data.research_metadata, output));
        }
      }
      break;
    }

    case "results": {
      const domain = args.flags.domain as string;
      if (!domain) {
        console.error("Error: --domain is required");
        process.exit(1);
      }

      const data = (await apiRequest(
        "GET",
        `/api/research/${domain}`,
      )) as ResearchResultsResponse;

      console.log(`Research results for ${domain}:`);
      console.log(formatOutput(data.discovered_codes, output));
      break;
    }

    default:
      console.log("Usage: refcli research [run|results]");
  }
}
