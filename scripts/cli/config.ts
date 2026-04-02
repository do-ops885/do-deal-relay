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
export function setApiKey(apiKey: string | undefined): void {
  config.apiKey = apiKey;
}

/**
 * Set the endpoint
 */
export function setEndpoint(endpoint: string): void {
  config.endpoint = endpoint;
}
