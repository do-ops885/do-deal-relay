/**
 * Webhook Load Test Processor
 *
 * Generates realistic webhook payloads for load testing.
 * Creates 1KB average payload size as specified in requirements.
 */

const crypto = require("crypto");

/**
 * Generate a realistic deal object
 */
function generateDeal() {
  const dealTypes = ["free_share", "bonus_cash", "commission_free", "discount"];
  const platforms = ["trading212", "robinhood", "webull", "public", "moomoo"];

  return {
    id: `deal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    platform: platforms[Math.floor(Math.random() * platforms.length)],
    type: dealTypes[Math.floor(Math.random() * dealTypes.length)],
    value: Math.floor(Math.random() * 500) + 10,
    currency: "USD",
    expiryDate: new Date(
      Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    terms: "Standard terms apply. Subject to eligibility requirements.",
    description:
      "Get a free stock when you sign up and fund your account with $100 or more.",
    url: "https://example.com/promo",
    country: "US",
    confidence: Math.random() * 0.5 + 0.5,
    trustScore: Math.random() * 0.5 + 0.5,
    verified: Math.random() > 0.2,
    category: ["finance", "trading", "investment"][
      Math.floor(Math.random() * 3)
    ],
    tags: ["promo", "signup", "bonus"],
  };
}

/**
 * Generate webhook payload (~1KB)
 */
function generatePayload(context, events, done) {
  const event = {
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: ["deal.created", "deal.updated", "deal.expired"][
      Math.floor(Math.random() * 3)
    ],
    timestamp: new Date().toISOString(),
  };

  const deal = generateDeal();

  // Add padding to reach ~1KB payload
  const baseSize = JSON.stringify({ event, deal }).length;
  const paddingNeeded = Math.max(0, 1024 - baseSize - 50); // 50 bytes buffer

  if (paddingNeeded > 0) {
    event.padding = "x".repeat(paddingNeeded);
  }

  // Generate signature
  const secret = process.env.WEBHOOK_SECRET || "test-secret";
  const signature = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify({ event, deal }))
    .digest("hex");

  context.vars.event = event;
  context.vars.deal = deal;
  context.vars.timestamp = event.timestamp;
  context.vars.signature = signature;

  return done();
}

/**
 * Generate batch webhook payload
 */
function generateBatchPayload(context, events, done) {
  const batchSize = Math.floor(Math.random() * 10) + 5; // 5-15 webhooks per batch
  const webhooks = [];

  for (let i = 0; i < batchSize; i++) {
    const event = {
      id: `evt_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`,
      type: ["deal.created", "deal.updated"][Math.floor(Math.random() * 2)],
      timestamp: new Date().toISOString(),
    };

    const deal = generateDeal();

    webhooks.push({
      event,
      deal,
      timestamp: event.timestamp,
    });
  }

  context.vars.webhooks = webhooks;

  return done();
}

/**
 * Custom function to verify response time
 */
function checkResponseTime(requestParams, response, context, events, done) {
  const responseTime = response.timings ? response.timings.total : 0;

  if (responseTime > 500) {
    events.emit("counter", "webhook.slow_response", 1);
  } else {
    events.emit("counter", "webhook.fast_response", 1);
  }

  return done();
}

module.exports = {
  generatePayload,
  generateBatchPayload,
  checkResponseTime,
};
