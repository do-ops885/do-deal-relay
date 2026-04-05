/**
 * Core API Routes - Barrel Export
 *
 * Re-exports all core route handlers for use in worker/index.ts.
 */

export { handleHealth, handleReady, handleLive, handleMetrics } from "./health";
export {
  handleGetDeals,
  handleSimilarDeals,
  handleRankedDeals,
  handleDealHighlights,
} from "./deals";
export { handleDiscover, handleStatus, handleGetLogs } from "./pipeline";
export { handleSubmit } from "./submit";
export { handleAnalytics } from "./analytics";
