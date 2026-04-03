import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createWebhook,
  listWebhooks,
  deleteWebhook,
  toggleWebhook,
  getWebhookById,
  updateWebhook,
  triggerWebhooks,
  generateWebhookSignature,
  verifyWebhookSignature,
  generateWebhookSecret,
  type WebhookConfig,
  type WebhookEvent,
} from "../../worker/lib/webhooks";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto with proper getRandomValues
let randomCounter = 0;
const mockSubtle = {
  importKey: vi.fn(),
  sign: vi.fn(),
};

// Use Object.defineProperty to override read-only global.crypto (Node.js 20+)
Object.defineProperty(global, "crypto", {
  value: {
    subtle: mockSubtle as unknown as SubtleCrypto,
    getRandomValues: (array: Uint8Array) => {
      // Fill with pseudo-random values based on counter
      for (let i = 0; i < array.length; i++) {
        array[i] = (Math.floor(Math.random() * 256) + randomCounter++) % 256;
      }
      return array;
    },
  } as Crypto,
  writable: true,
  configurable: true,
});

describe("Webhooks Module", () => {
  let mockEnv: {
    DEALS_SOURCES: {
      get: ReturnType<typeof vi.fn>;
      put: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockEnv = {
      DEALS_SOURCES: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      },
    };
  });

  describe("createWebhook", () => {
    it("should create a webhook with generated id and timestamp", async () => {
      const config = {
        url: "https://example.com/webhook",
        events: ["deal.discovered"] as WebhookEvent[],
        secret: "mysecret1234567890",
        active: true,
      };

      const result = await createWebhook(
        mockEnv as unknown as Parameters<typeof createWebhook>[0],
        config,
      );

      expect(result).toMatchObject({
        url: config.url,
        events: config.events,
        secret: config.secret,
        active: config.active,
      });
      expect(result.id).toMatch(/^wh_\d+_/);
      expect(result.createdAt).toBeDefined();
      expect(mockEnv.DEALS_SOURCES.put).toHaveBeenCalledTimes(2); // webhook + index
    });

    it("should generate a secret if not provided", async () => {
      const config = {
        url: "https://example.com/webhook",
        events: ["deal.discovered"] as WebhookEvent[],
        active: true,
      };

      const result = await createWebhook(
        mockEnv as unknown as Parameters<typeof createWebhook>[0],
        config,
      );

      expect(result.secret).toBeDefined();
      expect(result.secret.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe("listWebhooks", () => {
    it("should return empty array when no webhooks exist", async () => {
      mockEnv.DEALS_SOURCES.get.mockResolvedValue(null);

      const result = await listWebhooks(
        mockEnv as unknown as Parameters<typeof listWebhooks>[0],
      );

      expect(result).toEqual([]);
    });

    it("should return all webhooks from index", async () => {
      const webhook1: WebhookConfig = {
        id: "wh_1",
        url: "https://example1.com/webhook",
        secret: "secret1",
        events: ["deal.discovered"],
        active: true,
        createdAt: "2024-01-01T00:00:00Z",
      };
      const webhook2: WebhookConfig = {
        id: "wh_2",
        url: "https://example2.com/webhook",
        secret: "secret2",
        events: ["deal.published"],
        active: false,
        createdAt: "2024-01-02T00:00:00Z",
      };

      mockEnv.DEALS_SOURCES.get
        .mockResolvedValueOnce(JSON.stringify(["wh_1", "wh_2"])) // index
        .mockResolvedValueOnce(JSON.stringify(webhook1)) // wh_1
        .mockResolvedValueOnce(JSON.stringify(webhook2)); // wh_2

      const result = await listWebhooks(
        mockEnv as unknown as Parameters<typeof listWebhooks>[0],
      );

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("wh_1");
      expect(result[1].id).toBe("wh_2");
    });
  });

  describe("getWebhookById", () => {
    it("should return null for non-existent webhook", async () => {
      mockEnv.DEALS_SOURCES.get.mockResolvedValue(null);

      const result = await getWebhookById(
        mockEnv as unknown as Parameters<typeof getWebhookById>[0],
        "wh_nonexistent",
      );

      expect(result).toBeNull();
    });

    it("should return webhook config", async () => {
      const webhook: WebhookConfig = {
        id: "wh_1",
        url: "https://example.com/webhook",
        secret: "secret123",
        events: ["deal.discovered"],
        active: true,
        createdAt: "2024-01-01T00:00:00Z",
      };
      mockEnv.DEALS_SOURCES.get.mockResolvedValue(JSON.stringify(webhook));

      const result = await getWebhookById(
        mockEnv as unknown as Parameters<typeof getWebhookById>[0],
        "wh_1",
      );

      expect(result).toEqual(webhook);
    });
  });

  describe("deleteWebhook", () => {
    it("should delete webhook and remove from index", async () => {
      mockEnv.DEALS_SOURCES.get.mockResolvedValue(
        JSON.stringify(["wh_1", "wh_2"]),
      );

      await deleteWebhook(
        mockEnv as unknown as Parameters<typeof deleteWebhook>[0],
        "wh_1",
      );

      expect(mockEnv.DEALS_SOURCES.delete).toHaveBeenCalledWith("webhook:wh_1");
      expect(mockEnv.DEALS_SOURCES.put).toHaveBeenCalledWith(
        "webhooks:index",
        JSON.stringify(["wh_2"]),
      );
    });
  });

  describe("toggleWebhook", () => {
    it("should toggle active state", async () => {
      const webhook: WebhookConfig = {
        id: "wh_1",
        url: "https://example.com/webhook",
        secret: "secret",
        events: ["deal.discovered"],
        active: true,
        createdAt: "2024-01-01T00:00:00Z",
      };
      mockEnv.DEALS_SOURCES.get.mockResolvedValue(JSON.stringify(webhook));

      await toggleWebhook(
        mockEnv as unknown as Parameters<typeof toggleWebhook>[0],
        "wh_1",
        false,
      );

      expect(mockEnv.DEALS_SOURCES.put).toHaveBeenCalledWith(
        "webhook:wh_1",
        expect.stringContaining('"active":false'),
      );
    });

    it("should throw error for non-existent webhook", async () => {
      mockEnv.DEALS_SOURCES.get.mockResolvedValue(null);

      await expect(
        toggleWebhook(
          mockEnv as unknown as Parameters<typeof toggleWebhook>[0],
          "wh_nonexistent",
          false,
        ),
      ).rejects.toThrow("Webhook not found");
    });
  });

  describe("updateWebhook", () => {
    it("should update webhook fields", async () => {
      const webhook: WebhookConfig = {
        id: "wh_1",
        url: "https://old.com/webhook",
        secret: "oldsecret",
        events: ["deal.discovered"],
        active: true,
        createdAt: "2024-01-01T00:00:00Z",
      };
      mockEnv.DEALS_SOURCES.get.mockResolvedValue(JSON.stringify(webhook));

      const result = await updateWebhook(
        mockEnv as unknown as Parameters<typeof updateWebhook>[0],
        "wh_1",
        { url: "https://new.com/webhook", active: false },
      );

      expect(result.url).toBe("https://new.com/webhook");
      expect(result.active).toBe(false);
      expect(result.secret).toBe("oldsecret"); // unchanged
    });
  });

  describe("generateWebhookSignature", () => {
    it("should generate consistent signatures", async () => {
      // Setup mock
      const mockKey = { type: "secret" } as CryptoKey;
      mockSubtle.importKey.mockResolvedValue(mockKey);
      mockSubtle.sign.mockResolvedValue(
        new Uint8Array([0xab, 0xcd, 0xef]).buffer,
      );

      const signature1 = await generateWebhookSignature("payload", "secret");
      const signature2 = await generateWebhookSignature("payload", "secret");

      expect(signature1).toBe(signature2);
      expect(mockSubtle.sign).toHaveBeenCalled();
    });
  });

  describe("verifyWebhookSignature", () => {
    it("should return true for valid signature", async () => {
      // Setup mock
      const mockKey = { type: "secret" } as CryptoKey;
      mockSubtle.importKey.mockResolvedValue(mockKey);
      mockSubtle.sign.mockResolvedValue(
        new Uint8Array([0x01, 0x02, 0x03]).buffer,
      );

      // Mock the expected hex result
      const isValid = await verifyWebhookSignature(
        "payload",
        "010203",
        "secret",
      );

      expect(isValid).toBe(true);
    });

    it("should return false for invalid signature length", async () => {
      const isValid = await verifyWebhookSignature(
        "payload",
        "short",
        "secret",
      );

      expect(isValid).toBe(false);
    });
  });

  describe("generateWebhookSecret", () => {
    it("should generate 64 character hex string", () => {
      const secret = generateWebhookSecret();

      expect(secret).toHaveLength(64);
      expect(secret).toMatch(/^[a-f0-9]+$/);
    });

    it("should generate unique secrets", () => {
      const secret1 = generateWebhookSecret();
      const secret2 = generateWebhookSecret();

      expect(secret1).not.toBe(secret2);
    });
  });

  describe("triggerWebhooks", () => {
    beforeEach(() => {
      // Setup mock for crypto
      const mockKey = { type: "secret" } as CryptoKey;
      mockSubtle.importKey.mockResolvedValue(mockKey);
      mockSubtle.sign.mockResolvedValue(new Uint8Array(32).fill(0).buffer);

      // Setup mock for fetch
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });
    });

    it("should not call fetch when no webhooks exist", async () => {
      mockEnv.DEALS_SOURCES.get.mockResolvedValue(null);

      await triggerWebhooks(
        mockEnv as unknown as Parameters<typeof triggerWebhooks>[0],
        "deal.discovered",
        { count: 5 },
        "run_123",
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should trigger webhooks for matching events", async () => {
      const webhook: WebhookConfig = {
        id: "wh_1",
        url: "https://example.com/webhook",
        secret: "secret1234567890123456789012345678",
        events: ["deal.discovered", "deal.published"],
        active: true,
        createdAt: "2024-01-01T00:00:00Z",
      };
      mockEnv.DEALS_SOURCES.get
        .mockResolvedValueOnce(JSON.stringify(["wh_1"]))
        .mockResolvedValueOnce(JSON.stringify(webhook));

      await triggerWebhooks(
        mockEnv as unknown as Parameters<typeof triggerWebhooks>[0],
        "deal.discovered",
        { count: 5, deals: [] },
        "run_123",
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/webhook",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-Webhook-Event": "deal.discovered",
            "X-Webhook-ID": "wh_1",
          }),
        }),
      );
    });

    it("should not trigger inactive webhooks", async () => {
      const webhook: WebhookConfig = {
        id: "wh_1",
        url: "https://example.com/webhook",
        secret: "secret1234567890123456789012345678",
        events: ["deal.discovered"],
        active: false,
        createdAt: "2024-01-01T00:00:00Z",
      };
      mockEnv.DEALS_SOURCES.get
        .mockResolvedValueOnce(JSON.stringify(["wh_1"]))
        .mockResolvedValueOnce(JSON.stringify(webhook));

      await triggerWebhooks(
        mockEnv as unknown as Parameters<typeof triggerWebhooks>[0],
        "deal.discovered",
        { count: 5 },
        "run_123",
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should not trigger webhooks for non-subscribed events", async () => {
      const webhook: WebhookConfig = {
        id: "wh_1",
        url: "https://example.com/webhook",
        secret: "secret1234567890123456789012345678",
        events: ["deal.published"], // not subscribed to discovered
        active: true,
        createdAt: "2024-01-01T00:00:00Z",
      };
      mockEnv.DEALS_SOURCES.get
        .mockResolvedValueOnce(JSON.stringify(["wh_1"]))
        .mockResolvedValueOnce(JSON.stringify(webhook));

      await triggerWebhooks(
        mockEnv as unknown as Parameters<typeof triggerWebhooks>[0],
        "deal.discovered",
        { count: 5 },
        "run_123",
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should continue on webhook delivery failure", async () => {
      const webhook1: WebhookConfig = {
        id: "wh_1",
        url: "https://failing.com/webhook",
        secret: "secret1234567890123456789012345678",
        events: ["deal.discovered"],
        active: true,
        createdAt: "2024-01-01T00:00:00Z",
      };
      const webhook2: WebhookConfig = {
        id: "wh_2",
        url: "https://working.com/webhook",
        secret: "secret1234567890123456789012345678",
        events: ["deal.discovered"],
        active: true,
        createdAt: "2024-01-01T00:00:00Z",
      };
      mockEnv.DEALS_SOURCES.get
        .mockResolvedValueOnce(JSON.stringify(["wh_1", "wh_2"]))
        .mockResolvedValueOnce(JSON.stringify(webhook1))
        .mockResolvedValueOnce(JSON.stringify(webhook2));

      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: "OK" });

      // Should not throw
      await expect(
        triggerWebhooks(
          mockEnv as unknown as Parameters<typeof triggerWebhooks>[0],
          "deal.discovered",
          { count: 5 },
          "run_123",
        ),
      ).resolves.not.toThrow();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should include signature in payload", async () => {
      const webhook: WebhookConfig = {
        id: "wh_1",
        url: "https://example.com/webhook",
        secret: "secret1234567890123456789012345678",
        events: ["deal.discovered"],
        active: true,
        createdAt: "2024-01-01T00:00:00Z",
      };
      mockEnv.DEALS_SOURCES.get
        .mockResolvedValueOnce(JSON.stringify(["wh_1"]))
        .mockResolvedValueOnce(JSON.stringify(webhook));

      await triggerWebhooks(
        mockEnv as unknown as Parameters<typeof triggerWebhooks>[0],
        "deal.discovered",
        { test: "data" },
        "run_123",
      );

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body.signature).toBeDefined();
      expect(body.event).toBe("deal.discovered");
      expect(body.run_id).toBe("run_123");
      expect(body.data).toEqual({ test: "data" });
    });
  });
});
