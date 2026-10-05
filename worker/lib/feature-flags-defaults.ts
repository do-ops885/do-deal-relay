/**
 * Feature Flag Defaults (ADR-032)
 *
 * Split from feature-flags.ts (IMP-6 LOC hygiene). The declared flag set and
 * KV key constants; every flag description names its enforcement point.
 * Re-exported through ./feature-flags so existing importers are unchanged.
 */

import type { FeatureFlag } from "./feature-flags";

export const FEATURE_FLAG_PREFIX = "ff:";
export const DEFAULT_FLAGS_INITIALIZED_KEY = "__ff_initialized__";

// Default feature flags to initialize
export const DEFAULT_FLAGS: Omit<FeatureFlag, "createdAt" | "updatedAt">[] = [
  {
    name: "bulk_import_export",
    enabled: true,
    description:
      "Kill switch for bulk import/export endpoints (enforced in ops-routes.ts per ADR-032)",
  },
  {
    name: "nlq_ai_enhancement",
    enabled: true,
    description:
      "Kill switch for AI-powered NLQ enhancement (enforced in nlq/hybrid per ADR-032)",
  },
  {
    name: "email_processing",
    enabled: true,
    description:
      "Kill switch for email API endpoints (enforced in legacy-routes.ts per ADR-032)",
  },
  {
    name: "analytics_dashboard",
    enabled: true,
    description:
      "Kill switch for analytics + dashboard endpoints (enforced in legacy-routes.ts/ops-routes.ts per ADR-032)",
  },
  {
    name: "webhook_system",
    enabled: true,
    description:
      "Kill switch for webhook endpoints (enforced in legacy-routes.ts per ADR-032)",
  },
  {
    name: "real_research_fetching",
    enabled: true,
    rolloutPercentage: 100,
    description:
      "Enable real web scraping in the research agent (ProductHunt, GitHub, HN, Reddit, generic)",
  },
  {
    name: "ai_extractor_scraper",
    enabled: false,
    rolloutPercentage: 0,
    description:
      "Workers AI-based referral code extractor (fail-closed in research-agent extractWithAI per ADR-032; enable via PUT /api/admin/flags/ai_extractor_scraper)",
  },
  {
    name: "workflow_shadow_discovery",
    enabled: false,
    rolloutPercentage: 0,
    description:
      "Shadow-mode discovery workflow run after the main pipeline (read-only, no state writes)",
  },
  {
    name: "workflow_pipeline_cutover",
    enabled: false,
    rolloutPercentage: 0,
    description:
      "Route the 6h cron pipeline through the durable PipelineWorkflow instead of direct execution (ADR-018 wave 4)",
  },
];

// ============================================================================
// Types
// ============================================================================
