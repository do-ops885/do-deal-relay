/**
 * Referral Code Commands
 * CLI commands for referral code management
 */

import {
  ParsedArgs,
  ReferralResponse,
  ReferralListResponse,
} from "../types.js";
import { config } from "../config.js";
import { apiRequest, formatOutput, parseReferralUrl } from "../utils.js";

/**
 * Handle codes commands
 */
export async function handleCodes(args: ParsedArgs): Promise<void> {
  const output = (args.flags.output as string) || config.defaultOutput;

  switch (args.subcommand) {
    case "list": {
      const status = args.flags.status as string | undefined;
      const domain = args.flags.domain as string | undefined;
      const limit = parseInt((args.flags.limit as string) || "100", 10);

      const query = new URLSearchParams();
      if (status) query.set("status", status);
      if (domain) query.set("domain", domain);
      query.set("limit", String(limit));

      const data = (await apiRequest(
        "GET",
        `/api/referrals?${query}`,
      )) as ReferralListResponse;

      console.log(formatOutput(data.referrals, output));
      console.log("\nTotal: " + data.total + " referrals");
      break;
    }

    case "smart-add":
    case "smartadd": {
      const urlInput = (args.flags.url as string) || args.positional[0];

      if (!urlInput) {
        console.error("Error: URL required");
        console.error("Usage: refcli codes smart-add <referral-url>");
        console.error(
          "Example: refcli codes smart-add https://picnic.app/de/freunde-rabatt/DOMI6869",
        );
        process.exit(1);
      }

      const parsed = parseReferralUrl(urlInput);
      if (!parsed) {
        console.error("Error: Could not parse referral URL");
        console.error(
          "URL must contain a code in the path (e.g., /invite/CODE123)",
        );
        process.exit(1);
      }

      console.log("Parsed referral URL:");
      console.log("  URL: " + parsed.url);
      console.log("  Domain: " + parsed.domain);
      console.log("  Code: " + parsed.code);

      const body = {
        code: parsed.code,
        url: parsed.url,
        domain: parsed.domain,
        source: "cli-smart",
        submitted_by: "cli-user",
        metadata: {
          title: (args.flags.title as string) || parsed.domain + " Referral",
          description: args.flags.description as string | undefined,
          reward_type: (args.flags["reward-type"] as string) || "unknown",
          reward_value: args.flags["reward-value"] as
            | string
            | number
            | undefined,
          currency: args.flags.currency as string | undefined,
          category: args.flags.category
            ? (args.flags.category as string).split(",")
            : ["general"],
          tags: ["smart-add", "cli-added"],
          notes: "Auto-parsed from URL: " + parsed.path,
        },
      };

      const data = (await apiRequest(
        "POST",
        "/api/referrals",
        body,
      )) as ReferralResponse;

      if (data.success) {
        console.log("[OK] Created referral: " + parsed.code);
        console.log(formatOutput(data.referral, output));
      }
      break;
    }

    case "add": {
      const code = args.flags.code as string;
      const url = args.flags.url as string;
      const domain = args.flags.domain as string;

      if (!code || !url || !domain) {
        console.error("Error: --code, --url, and --domain are required");
        process.exit(1);
      }

      const body = {
        code,
        url,
        domain,
        source: "cli",
        submitted_by: "cli-user",
        metadata: {
          title: (args.flags.title as string) || domain + " Referral",
          description: args.flags.description as string | undefined,
          reward_type: (args.flags["reward-type"] as string) || "unknown",
          reward_value: args.flags["reward-value"] as
            | string
            | number
            | undefined,
          currency: args.flags.currency as string | undefined,
          category: args.flags.category
            ? (args.flags.category as string).split(",")
            : ["general"],
          tags: args.flags.tags
            ? (args.flags.tags as string).split(",")
            : ["cli-added"],
          notes: args.flags.notes as string | undefined,
        },
      };

      const data = (await apiRequest(
        "POST",
        "/api/referrals",
        body,
      )) as ReferralResponse;

      if (data.success) {
        console.log("[OK] Created referral: " + code);
        console.log(formatOutput(data.referral, output));
      }
      break;
    }

    case "get": {
      const code = args.positional[0];
      if (!code) {
        console.error("Error: Code required");
        process.exit(1);
      }

      const data = (await apiRequest("GET", `/api/referrals/${code}`)) as {
        referral: unknown;
      };
      console.log(formatOutput(data.referral, output));
      break;
    }

    case "deactivate": {
      const code = args.positional[0];
      if (!code) {
        console.error("Error: Code required");
        process.exit(1);
      }

      const reason = (args.flags.reason as string) || "user_request";
      const replacedBy = args.flags["replaced-by"] as string | undefined;
      const notes = args.flags.notes as string | undefined;

      const body = {
        reason,
        replaced_by: replacedBy,
        notes,
      };

      const data = (await apiRequest(
        "POST",
        `/api/referrals/${code}/deactivate`,
        body,
      )) as ReferralResponse;

      if (data.success) {
        console.log("[OK] Deactivated referral: " + code);
        console.log(formatOutput(data.referral, output));
      }
      break;
    }

    case "reactivate": {
      const code = args.positional[0];
      if (!code) {
        console.error("Error: Code required");
        process.exit(1);
      }

      const data = (await apiRequest(
        "POST",
        `/api/referrals/${code}/reactivate`,
        {},
      )) as ReferralResponse;

      if (data.success) {
        console.log("[OK] Reactivated referral: " + code);
        console.log(formatOutput(data.referral, output));
      }
      break;
    }

    default:
      console.log(
        "Usage: refcli codes [list|add|smart-add|get|deactivate|reactivate]",
      );
  }
}
