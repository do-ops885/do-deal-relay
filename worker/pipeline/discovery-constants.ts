/**
 * Shared constants for the discovery pipeline.
 *
 * Used by both discover.ts (orchestrator) and discover-parsers.ts (regex parsing)
 * to prevent silent drift when values are updated.
 *
 * IMPORTANT: Also update the static regex in discover-parsers.ts if these change.
 */

export const DISCOVERY_CODE_CONSTANTS = {
  MIN_CODE_LENGTH: 6,
  MAX_CODE_LENGTH: 20,
} as const;
