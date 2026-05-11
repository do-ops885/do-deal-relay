import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MigrationRunner,
  getMigrationStatus,
} from "../../worker/lib/d1/migrations";
import type { D1Database } from "@cloudflare/workers-types";

// Mock D1 Client
vi.mock("../../worker/lib/d1/client", () => {
  const mockClient = {
    query: vi.fn(),
    execute: vi.fn(),
    raw: vi.fn(),
    transaction: vi.fn((ops: any) =>
      Promise.all(ops.map((op: any) => op())).then((results) => ({
        success: true,
        results,
      })),
    ),
  };
  return {
    createD1Client: () => mockClient,
  };
});

import { createD1Client } from "../../worker/lib/d1/client";

describe("D1 Migrations", () => {
  const mockDb = {} as D1Database;
  const mockClient = createD1Client(mockDb);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("MigrationRunner", () => {
    it("getStatus should return pending and applied migrations", async () => {
      (mockClient.raw as any).mockResolvedValue({ success: true });
      (mockClient.query as any).mockResolvedValue({
        success: true,
        data: [{ version: 1 }],
      });

      const runner = new MigrationRunner(mockDb);
      const status = await runner.getStatus();

      expect(status.applied).toContain(1);
      expect(status.currentVersion).toBe(1);
      expect(status.pending).not.toContain(1);
    });

    it("migrate should apply pending migrations", async () => {
      (mockClient.raw as any).mockResolvedValue({ success: true });
      (mockClient.query as any).mockResolvedValue({ success: true, data: [] });
      (mockClient.execute as any).mockResolvedValue({ success: true });

      const runner = new MigrationRunner(mockDb);
      const result = await runner.migrate();

      expect(result.success).toBe(true);
      expect(result.applied.length).toBeGreaterThan(0);
    });

    it("rollback should revert migrations", async () => {
      (mockClient.raw as any).mockResolvedValue({ success: true });
      (mockClient.query as any).mockResolvedValue({
        success: true,
        data: [{ version: 1 }],
      });
      (mockClient.execute as any).mockResolvedValue({ success: true });

      const runner = new MigrationRunner(mockDb);
      const result = await runner.rollback(1);

      expect(result.success).toBe(true);
      expect(result.rolledBack).toContain(1);
    });
  });

  describe("Helper Functions", () => {
    it("getMigrationStatus should use runner", async () => {
      (mockClient.raw as any).mockResolvedValue({ success: true });
      (mockClient.query as any).mockResolvedValue({ success: true, data: [] });

      const status = await getMigrationStatus(mockDb);
      expect(status.currentVersion).toBe(0);
    });
  });
});
