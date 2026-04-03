/**
 * KV Storage Load Test Processor
 *
 * Generates realistic KV operations for load testing.
 * Simulates 10,000 operations with mixed read/write/delete patterns.
 */

const crypto = require("crypto");

// Key namespaces for testing
const KEY_NAMESPACES = {
  DEALS: "deals",
  SOURCES: "sources",
  METRICS: "metrics",
  LOCKS: "locks",
  LOGS: "logs",
};

/**
 * Generate a realistic key
 */
function generateKey(namespace) {
  const ns =
    namespace || Object.values(KEY_NAMESPACES)[Math.floor(Math.random() * 5)];
  const id = crypto.randomUUID();
  return `${ns}:${id}`;
}

/**
 * Generate a realistic value (various sizes)
 */
function generateValue() {
  const valueTypes = ["small", "medium", "large"];
  const type = valueTypes[Math.floor(Math.random() * valueTypes.length)];

  switch (type) {
    case "small":
      // ~100 bytes - simple metadata
      return JSON.stringify({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        status: ["active", "pending", "expired"][Math.floor(Math.random() * 3)],
      });

    case "medium":
      // ~500 bytes - deal data
      return JSON.stringify({
        id: crypto.randomUUID(),
        platform: ["trading212", "robinhood", "webull"][
          Math.floor(Math.random() * 3)
        ],
        type: ["free_share", "bonus_cash"][Math.floor(Math.random() * 2)],
        value: Math.floor(Math.random() * 500),
        currency: "USD",
        url: "https://example.com/promo",
        expiryDate: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        confidence: Math.random() * 0.5 + 0.5,
        metadata: {
          created: new Date().toISOString(),
          source: "api",
          version: "0.1.2",
        },
      });

    case "large":
      // ~2KB - snapshot data
      const deals = [];
      for (let i = 0; i < 5; i++) {
        deals.push({
          id: `deal_${i}`,
          platform: ["trading212", "robinhood"][i % 2],
          type: "free_share",
          value: Math.floor(Math.random() * 100),
        });
      }
      return JSON.stringify({
        version: "0.1.2",
        timestamp: new Date().toISOString(),
        deals,
        stats: {
          total: deals.length,
          active: deals.filter((d) => d.value > 0).length,
          byPlatform: {},
        },
      });
  }
}

/**
 * Generate TTL (random expiration)
 */
function generateTTL() {
  // 10% no TTL, 60% short TTL (1-24h), 30% long TTL (1-30 days)
  const rand = Math.random();
  if (rand < 0.1) return null;
  if (rand < 0.7) return Math.floor(Math.random() * 86400) + 3600; // 1-24 hours
  return Math.floor(Math.random() * 2592000) + 86400; // 1-30 days
}

/**
 * Generate read operation parameters
 */
function generateReadOperation(context, events, done) {
  // 70% chance of reading existing keys, 30% random
  if (
    Math.random() < 0.7 &&
    context.vars.recentKeys &&
    context.vars.recentKeys.length > 0
  ) {
    context.vars.key =
      context.vars.recentKeys[
        Math.floor(Math.random() * context.vars.recentKeys.length)
      ];
  } else {
    context.vars.key = generateKey();
  }

  return done();
}

/**
 * Generate write operation parameters
 */
function generateWriteOperation(context, events, done) {
  const key = generateKey();
  const value = generateValue();
  const ttl = generateTTL();

  context.vars.key = key;
  context.vars.value = value;
  context.vars.ttl = ttl;

  // Track this key for future reads
  if (!context.vars.recentKeys) {
    context.vars.recentKeys = [];
  }
  context.vars.recentKeys.push(key);
  // Keep only last 100 keys
  if (context.vars.recentKeys.length > 100) {
    context.vars.recentKeys.shift();
  }

  return done();
}

/**
 * Generate delete operation parameters
 */
function generateDeleteOperation(context, events, done) {
  // Prefer deleting keys we created
  if (
    context.vars.recentKeys &&
    context.vars.recentKeys.length > 0 &&
    Math.random() < 0.8
  ) {
    const index = Math.floor(Math.random() * context.vars.recentKeys.length);
    context.vars.key = context.vars.recentKeys[index];
    // Remove from recent keys (simulate deletion)
    context.vars.recentKeys.splice(index, 1);
  } else {
    context.vars.key = generateKey();
  }

  return done();
}

/**
 * Check for rate limiting in response
 */
function checkRateLimit(requestParams, response, context, events, done) {
  if (response.statusCode === 429) {
    events.emit("counter", "kv.rate_limited", 1);
  } else if (response.statusCode >= 200 && response.statusCode < 300) {
    events.emit("counter", "kv.success", 1);
  } else {
    events.emit("counter", "kv.error", 1);
  }

  return done();
}

/**
 * Custom metrics for KV operations
 */
function recordKVLatency(requestParams, response, context, events, done) {
  if (response.timings && response.timings.total) {
    events.emit("histogram", "kv.latency", response.timings.total);
  }

  return done();
}

module.exports = {
  generateReadOperation,
  generateWriteOperation,
  generateDeleteOperation,
  checkRateLimit,
  recordKVLatency,
};
