/**
 * Bulk Import/Export Routes
 *
 * Re-exports for:
 * - POST /api/bulk/import - Import multiple referral codes at once
 * - GET /api/bulk/export - Export deals as CSV or JSON
 */

// Import handlers
export { handleBulkImport, processBulkImportItem } from "./import";
export type { BulkImportResult } from "./import";
export { handleBulkExport } from "./export";
