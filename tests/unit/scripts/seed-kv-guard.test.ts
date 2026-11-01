import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve(process.cwd(), "scripts/seed-kv.sh");
const EXISTING_SNAPSHOT = '{"version":"1.0.0","deals":[{"id":"test-deal-1"}]}';

interface Harness {
  dir: string;
  puts: () => string[];
  backupDir: string;
}

/**
 * Runs the real script against a fake `wrangler` on PATH: `kv key get`
 * returns `FAKE_EXISTING` (or fails when empty), `kv key put` is only
 * logged, and `whoami` succeeds. Nothing reaches Cloudflare.
 */
function makeHarness(dir: string): Harness {
  const bin = join(dir, "bin");
  const log = join(dir, "puts.log");
  const backupDir = join(dir, "backup");
  const stateDir = join(dir, "state");
  mkdirSync(bin, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(log, "");

  const shim = join(bin, "wrangler");
  writeFileSync(
    shim,
    `#!/usr/bin/env bash
case "$1 $2" in
  "whoami "*) exit 0 ;;
  "kv key")
    case "$3" in
      get)
        if [ -f "\${FAKE_STATE_DIR}/$6" ]; then cat "\${FAKE_STATE_DIR}/$6";
        elif [ -n "\${FAKE_EXISTING:-}" ]; then printf '%s' "\${FAKE_EXISTING}";
        else exit 1; fi
        ;;
      put)
        printf '%s\\n' "$*" >> "\${FAKE_LOG}"
        printf '%s' "\${@: -1}" > "\${FAKE_STATE_DIR}/$6"
        ;;
    esac
    ;;
esac
exit 0
`,
  );
  chmodSync(shim, 0o755);

  return {
    dir,
    backupDir,
    puts: () =>
      readFileSync(log, "utf8")
        .split("\n")
        .filter((line) => line.length > 0),
  };
}

function run(
  script: string[],
  harness: Harness,
  existing: string | null = EXISTING_SNAPSHOT,
) {
  return spawnSync("bash", [SCRIPT, ...script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${join(harness.dir, "bin")}:${process.env.PATH ?? ""}`,
      FAKE_LOG: join(harness.dir, "puts.log"),
      FAKE_STATE_DIR: join(harness.dir, "state"),
      FAKE_EXISTING: existing ?? "",
      SEED_BACKUP_DIR: harness.backupDir,
    },
  });
}

function newTempDir(): string {
  return mkdtempSync(join(tmpdir(), "seed-kv-guard-"));
}

describe("scripts/seed-kv.sh overwrite guard", () => {
  it("refuses to overwrite an existing key and backs it up first", () => {
    const harness = makeHarness(newTempDir());

    const result = run([], harness);

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("refusing to overwrite");
    expect(harness.puts()).toEqual([]);

    const stamps = readdirSync(harness.backupDir);
    expect(stamps).toHaveLength(1);
    const backup = join(
      harness.backupDir,
      stamps[0] ?? "missing",
      "snapshot-prod.json",
    );
    expect(existsSync(backup)).toBe(true);
    expect(readFileSync(backup, "utf8")).toBe(EXISTING_SNAPSHOT);
  });

  it("writes nothing and takes no backup during a dry run", () => {
    const harness = makeHarness(newTempDir());

    const result = run(["--dry-run"], harness);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("nothing was written");
    expect(harness.puts()).toEqual([]);
    expect(existsSync(harness.backupDir)).toBe(false);
  });

  it("writes only with --force, still after backing up", () => {
    const harness = makeHarness(newTempDir());

    const result = run(["--force"], harness);

    expect(result.status).toBe(0);
    const puts = harness.puts();
    expect(puts).toHaveLength(2);
    expect(puts[0]).toContain("snapshot:prod");
    expect(puts[1]).toContain("registry");
    expect(readdirSync(harness.backupDir)).toHaveLength(1);
  });

  it("writes without a backup when the keys are absent", () => {
    const harness = makeHarness(newTempDir());

    const result = run([], harness, null);

    expect(result.status).toBe(0);
    expect(harness.puts()).toHaveLength(2);
    expect(existsSync(harness.backupDir)).toBe(false);
  });
});
