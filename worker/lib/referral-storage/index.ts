// Referral Storage Module - Re-exports
// ============================================================================

// Types and constants
export { REFERRAL_KEYS } from "./types";
export type { ReferralStorageKeys } from "./types";

// CRUD Operations
export {
  storeReferralInput,
  getReferralById,
  getReferralByCode,
  updateReferralStatus,
  deactivateReferral,
  reactivateReferral,
} from "./crud";

// Search and Query Operations
export {
  getReferralsByDomain,
  getReferralsByStatus,
  searchReferrals,
  storeResearchResults,
  getLatestResearch,
  referralToDeal,
  getActiveReferralsAsDeals,
  deactivateExpiredReferrals,
} from "./search";
