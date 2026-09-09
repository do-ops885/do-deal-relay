/**
 * CLI Configuration
 * Configuration and constants for the referral CLI tool
 */

import { join } from "path";
import { homedir } from "os";
import { Config } from "./types.js";

// Paths
export const CONFIG_DIR = join(homedir(), ".refcli");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");

// Default values
export const DEFAULT_ENDPOINT =
  process.env.REFCLI_ENDPOINT || "http://localhost:8787";

// Global config instance
export let config: Config = {
  endpoint: DEFAULT_ENDPOINT,
  defaultOutput: "table",
};

/**
 * Update the global config
 */
export function setConfig(newConfig: Partial<Config>): void {
  config = { ...config, ...newConfig };
}

/**
 * Set the API key
 */
export function setApiKey(value: string | undefined): void {
  // eslint-disable-next-line security/detect-possible-timing-attacks, security-node/detect-possible-timing-attacks -- undefined-presence check performs no secret comparison; no timing signal exists
  if (value === undefined) {
    delete config.apiKey;
  } else {
    config.apiKey = value;
  }
}

/**
 * Set the endpoint
 */
export function setEndpoint(endpoint: string): void {
  config.endpoint = endpoint;
}
