// ============================================================================
// Webhook Handler - Thin wrapper re-exporting from webhook/ module
// ============================================================================
//
// NOTE: This file is maintained for backward compatibility.
// New code should import directly from the webhook/ submodules:
// - worker/lib/webhook/types.ts       - All type definitions
// - worker/lib/webhook/subscriptions.ts - Partner/subscription management
// - worker/lib/webhook/delivery.ts    - Event delivery and retry logic
// - worker/lib/webhook/incoming.ts   - Incoming webhook processing
// - worker/lib/webhook/index.ts      - All exports combined
//
// ============================================================================

export * from "./webhook/index";
