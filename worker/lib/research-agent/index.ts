// Research Agent Module - Re-exports
// ============================================================================

// Main orchestration functions
export {
  executeReferralResearch,
  convertResearchToReferrals,
  researchAllReferralPossibilities,
} from "./orchestrator";

// Source management
export {
  addResearchSource,
  getResearchSources,
  registerKnownProgram,
} from "./sources";

// Types (for external use)
export type { ResearchSource } from "./types";
