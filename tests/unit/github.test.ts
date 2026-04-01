import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getFileContent,
  commitFile,
  commitSnapshot,
  createGitHubIssue,
  getRecentCommits,
  isSnapshotCommitted,
  verifyCommit,
} from "../../worker/lib/github";
import type { Snapshot } from "../../worker/types";

const TEST_TOKEN = "test-token";

describe("GitHub Integration", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getFileContent", () => {
    it("should retrieve file content", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ content: btoa("file content"), sha: "abc123" }),
      });

      const result = await getFileContent("owner/repo", "file.txt", TEST_TOKEN);

      expect(result).toEqual({
        content: btoa("file content"),
        sha: "abc123",
      });
    });

    it("should return null for non-existent files", async () => {
      fetchMock.mockResolvedValue({
        status: 404,
        ok: false,
      });

      const result = await getFileContent(
        "owner/repo",
        "missing.txt",
        TEST_TOKEN,
      );

      expect(result).toBeNull();
    });

    it("should throw on API errors", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(
        getFileContent("owner/repo", "file.txt", TEST_TOKEN),
      ).rejects.toThrow("GitHub API error");
    });

    it("should use specified branch", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ content: "", sha: "abc" }),
      });

      await getFileContent("owner/repo", "file.txt", TEST_TOKEN, "develop");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/contents/file.txt?ref=develop",
        expect.any(Object),
      );
    });
  });

  describe("commitFile", () => {
    it("should create new file", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ commit: { sha: "commit-sha" } }),
      });

      const sha = await commitFile(
        "owner/repo",
        "new-file.txt",
        "content",
        TEST_TOKEN,
        "Create new file",
      );

      expect(sha).toBe("commit-sha");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/contents/new-file.txt",
        expect.objectContaining({
          method: "PUT",
          body: expect.not.stringContaining("sha"),
        }),
      );
    });

    it("should update existing file with SHA", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ commit: { sha: "new-commit-sha" } }),
      });

      const sha = await commitFile(
        "owner/repo",
        "existing.txt",
        "updated content",
        TEST_TOKEN,
        "Update file",
        "main",
        "old-sha",
      );

      expect(sha).toBe("new-commit-sha");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/contents/existing.txt",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining("old-sha"),
        }),
      );
    });

    it("should use specified branch", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ commit: { sha: "sha" } }),
      });

      await commitFile(
        "owner/repo",
        "file.txt",
        "content",
        TEST_TOKEN,
        "Message",
        "develop",
      );

      const body = JSON.parse(
        (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1]
          .body,
      );
      expect(body.branch).toBe("develop");
    });

    it("should encode content to base64", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ commit: { sha: "sha" } }),
      });

      const content = "Test content with special chars: ñ é ü";
      await commitFile("owner/repo", "file.txt", content, TEST_TOKEN, "Msg");

      const body = JSON.parse(
        (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1]
          .body,
      );
      expect(body.content).toBe(btoa(unescape(encodeURIComponent(content))));
    });
  });

  describe("commitSnapshot", () => {
    it("should commit snapshot with proper message", async () => {
      fetchMock
        .mockResolvedValueOnce({
          status: 404,
          ok: false,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ commit: { sha: "snapshot-sha" } }),
        });

      const snapshot: Snapshot = {
        version: "0.1.1",
        generated_at: "2024-03-31T00:00:00Z",
        run_id: "test-run-123",
        trace_id: "test-trace",
        snapshot_hash: "abc123hash",
        previous_hash: "",
        schema_version: "0.1.1",
        stats: {
          total: 10,
          active: 8,
          quarantined: 0,
          rejected: 0,
          duplicates: 0,
        },
        deals: [],
      };

      const sha = await commitSnapshot("owner/repo", TEST_TOKEN, snapshot, {
        total: 10,
        active: 8,
      });

      expect(sha).toBe("snapshot-sha");

      // Verify message format
      const body = JSON.parse(
        (fetchMock.mock.calls[1] as unknown as [string, { body: string }])[1]
          .body,
      );
      expect(body.message).toContain("[AUTO] Update deals");
      expect(body.message).toContain("test-run-123");
      expect(body.message).toContain("Total: 10");
      expect(body.message).toContain("Active: 8");
      expect(body.message).toContain("[skip ci]");
    });

    it("should use existing file SHA when updating", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: "", sha: "existing-sha" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ commit: { sha: "new-sha" } }),
        });

      const snapshot: Snapshot = {
        version: "0.1.1",
        generated_at: "2024-03-31T00:00:00Z",
        run_id: "run-456",
        trace_id: "trace-456",
        snapshot_hash: "def456",
        previous_hash: "",
        schema_version: "0.1.1",
        stats: {
          total: 5,
          active: 5,
          quarantined: 0,
          rejected: 0,
          duplicates: 0,
        },
        deals: [],
      };

      await commitSnapshot("owner/repo", TEST_TOKEN, snapshot, {
        total: 5,
        active: 5,
      });

      const body = JSON.parse(
        (fetchMock.mock.calls[1] as unknown as [string, { body: string }])[1]
          .body,
      );
      expect(body.sha).toBe("existing-sha");
    });
  });

  describe("createGitHubIssue", () => {
    it("should create issue with correct format", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ number: 42 }),
      });

      const issueNumber = await createGitHubIssue(
        "owner/repo",
        TEST_TOKEN,
        "pipeline_failure",
        "run-789",
        {
          severity: "critical",
          message: "Pipeline failed during validation",
          context: { phase: "validate", error: "Validation error" },
        },
      );

      expect(issueNumber).toBe(42);

      const [url, options] = fetchMock.mock.calls[0] as unknown as [
        string,
        { body: string },
      ];
      expect(url).toBe("https://api.github.com/repos/owner/repo/issues");

      const body = JSON.parse(options.body);
      expect(body.title).toBe("[NOTIFY] pipeline_failure - run-789");
      expect(body.body).toContain("Pipeline failed during validation");
      expect(body.body).toContain("critical");
      expect(body.labels).toContain("pipeline_failure");
      expect(body.labels).toContain("critical");
    });

    it("should throw on API error", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
      });

      await expect(
        createGitHubIssue("owner/repo", TEST_TOKEN, "error", "run-000", {
          severity: "warning",
          message: "Test",
        }),
      ).rejects.toThrow("Failed to create issue");
    });
  });

  describe("getRecentCommits", () => {
    it("should retrieve commits", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => [
          {
            sha: "commit-1",
            commit: {
              message: "Update deals",
              author: {
                name: "Bot",
                email: "bot@example.com",
                date: "2024-03-31T00:00:00Z",
              },
            },
          },
        ],
      });

      const commits = await getRecentCommits(
        "owner/repo",
        TEST_TOKEN,
        "deals.json",
        1,
      );

      expect(commits).toHaveLength(1);
      expect(commits[0].sha).toBe("commit-1");
      expect(commits[0].message).toBe("Update deals");
    });

    it("should use default count of 10", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      await getRecentCommits("owner/repo", TEST_TOKEN, "file.txt");

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("per_page=10"),
        expect.any(Object),
      );
    });

    it("should handle errors gracefully", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const commits = await getRecentCommits(
        "owner/repo",
        TEST_TOKEN,
        "file.txt",
      );

      expect(commits).toEqual([]);
    });
  });

  describe("isSnapshotCommitted", () => {
    it("should return true when snapshot is committed", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => [
          {
            sha: "abc123",
            commit: {
              message: "[AUTO] Update deals - abc123hash",
              author: { name: "", email: "", date: "" },
            },
          },
        ],
      });

      const result = await isSnapshotCommitted(
        "owner/repo",
        TEST_TOKEN,
        "abc123hash",
      );

      expect(result).toBe(true);
    });

    it("should return false when snapshot not found", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => [
          {
            sha: "xyz789",
            commit: {
              message: "Different commit",
              author: { name: "", email: "", date: "" },
            },
          },
        ],
      });

      const result = await isSnapshotCommitted(
        "owner/repo",
        TEST_TOKEN,
        "notfound",
      );

      expect(result).toBe(false);
    });
  });

  describe("verifyCommit", () => {
    it("should return true when SHA matches", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => [
          {
            sha: "expected-sha",
            commit: {
              message: "Update",
              author: { name: "", email: "", date: "" },
            },
          },
        ],
      });

      const result = await verifyCommit(
        "owner/repo",
        TEST_TOKEN,
        "expected-sha",
      );

      expect(result).toBe(true);
    });

    it("should return false when SHA does not match", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => [
          {
            sha: "different-sha",
            commit: {
              message: "Update",
              author: { name: "", email: "", date: "" },
            },
          },
        ],
      });

      const result = await verifyCommit(
        "owner/repo",
        TEST_TOKEN,
        "expected-sha",
      );

      expect(result).toBe(false);
    });

    it("should return false when no commits found", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      const result = await verifyCommit("owner/repo", TEST_TOKEN, "sha");

      expect(result).toBe(false);
    });
  });
});
