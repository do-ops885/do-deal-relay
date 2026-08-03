import { describe, it, expect } from "vitest";
import {
  splitSqlStatements,
  stripSqlComments,
} from "../../../worker/lib/d1/factory";

// ============================================================================
// stripSqlComments
// ============================================================================

describe("stripSqlComments", () => {
  it("removes full-line -- comments", () => {
    const sql =
      "-- header comment\nCREATE TABLE foo (id INTEGER);\n-- footer comment";
    expect(stripSqlComments(sql)).toBe("CREATE TABLE foo (id INTEGER);");
  });

  it("removes blank and whitespace-only lines", () => {
    const sql = "\n\nCREATE TABLE foo (id INTEGER);\n   \n";
    expect(stripSqlComments(sql)).toBe("CREATE TABLE foo (id INTEGER);");
  });

  it("removes comment lines that have leading whitespace", () => {
    const sql = "  -- indented comment\nSELECT 1;";
    expect(stripSqlComments(sql)).toBe("SELECT 1;");
  });

  it("preserves inline trailing comments", () => {
    const sql = "SELECT 1 -- inline note";
    expect(stripSqlComments(sql)).toBe("SELECT 1 -- inline note");
  });

  it("preserves block comments", () => {
    const sql = "/* block comment */\nSELECT 1;";
    expect(stripSqlComments(sql)).toBe("/* block comment */\nSELECT 1;");
  });

  it("returns an empty string for comment-only or blank input", () => {
    expect(stripSqlComments("-- only a comment\n-- another")).toBe("");
    expect(stripSqlComments("\n   \n")).toBe("");
    expect(stripSqlComments("")).toBe("");
  });

  it("keeps multiple non-comment lines joined by a newline", () => {
    const sql =
      "-- drop\nDROP TABLE IF EXISTS t;\n-- create\nCREATE TABLE t (id INTEGER);";
    expect(stripSqlComments(sql)).toBe(
      "DROP TABLE IF EXISTS t;\nCREATE TABLE t (id INTEGER);",
    );
  });
});

// ============================================================================
// splitSqlStatements
// ============================================================================

describe("splitSqlStatements", () => {
  it("splits multiple semicolon-terminated statements", () => {
    const sql =
      "CREATE TABLE foo (id INTEGER); INSERT INTO foo (id) VALUES (1);";
    expect(splitSqlStatements(sql)).toEqual([
      "CREATE TABLE foo (id INTEGER)",
      "INSERT INTO foo (id) VALUES (1)",
    ]);
  });

  it("emits the final statement without a trailing semicolon", () => {
    expect(splitSqlStatements("SELECT 1")).toEqual(["SELECT 1"]);
  });

  it("returns an empty array for empty or whitespace-only input", () => {
    expect(splitSqlStatements("")).toEqual([]);
    expect(splitSqlStatements("   \n  ")).toEqual([]);
  });

  it("does not split semicolons inside single-quoted strings", () => {
    const sql = "INSERT INTO t (v) VALUES ('a;b'); SELECT 1;";
    expect(splitSqlStatements(sql)).toEqual([
      "INSERT INTO t (v) VALUES ('a;b')",
      "SELECT 1",
    ]);
  });

  it("handles escaped single quotes via doubled quotes", () => {
    const sql = "INSERT INTO t (v) VALUES ('it''s; here'); SELECT 1;";
    expect(splitSqlStatements(sql)).toEqual([
      "INSERT INTO t (v) VALUES ('it''s; here')",
      "SELECT 1",
    ]);
  });

  it("does not split semicolons inside double-quoted identifiers", () => {
    const sql = 'SELECT "a;b" AS x; SELECT 1;';
    expect(splitSqlStatements(sql)).toEqual(['SELECT "a;b" AS x', "SELECT 1"]);
  });

  it("does not split semicolons inside backtick-quoted identifiers", () => {
    const sql = "SELECT `a;b` FROM t; SELECT 1;";
    expect(splitSqlStatements(sql)).toEqual([
      "SELECT `a;b` FROM t",
      "SELECT 1",
    ]);
  });

  it("keeps CREATE TRIGGER bodies with internal semicolons as one statement", () => {
    const sql = `CREATE TRIGGER trg AFTER INSERT ON t
BEGIN
  INSERT INTO log (msg) VALUES ('x;y');
  UPDATE t2 SET n = n + 1;
END;
SELECT 1;`;
    expect(splitSqlStatements(sql)).toEqual([
      `CREATE TRIGGER trg AFTER INSERT ON t
BEGIN
  INSERT INTO log (msg) VALUES ('x;y');
  UPDATE t2 SET n = n + 1;
END`,
      "SELECT 1",
    ]);
  });

  it("does not treat BEGIN/END substrings inside identifiers as block boundaries", () => {
    const sql = "UPDATE t SET begin_time = 1, ended_at = 2; SELECT 1;";
    expect(splitSqlStatements(sql)).toEqual([
      "UPDATE t SET begin_time = 1, ended_at = 2",
      "SELECT 1",
    ]);
  });

  it("splits statements that survive comment stripping", () => {
    const sql = stripSqlComments(
      "-- comment\nCREATE TABLE a (id INTEGER);\n-- another\nSELECT 1;",
    );
    expect(splitSqlStatements(sql)).toEqual([
      "CREATE TABLE a (id INTEGER)",
      "SELECT 1",
    ]);
  });

  it("keeps inline trailing comments within the statement text", () => {
    expect(splitSqlStatements("SELECT 1 -- note")).toEqual([
      "SELECT 1 -- note",
    ]);
  });

  it("treats consecutive lines without a semicolon as a single statement", () => {
    expect(splitSqlStatements("SELECT 1\nSELECT 2")).toEqual([
      "SELECT 1\nSELECT 2",
    ]);
  });

  it("drops a trailing comment-only chunk after a semicolon", () => {
    const sql = "UPDATE x SET y = 1; -- note;";
    expect(splitSqlStatements(sql)).toEqual(["UPDATE x SET y = 1"]);
  });

  it("drops comment-only chunks spanning multiple lines", () => {
    const sql = "SELECT 1;\n-- note one\n-- note two;";
    expect(splitSqlStatements(sql)).toEqual(["SELECT 1"]);
  });

  it("returns an empty array for comment-only input", () => {
    expect(splitSqlStatements("-- only a comment")).toEqual([]);
    expect(splitSqlStatements("-- a\n-- b;")).toEqual([]);
  });

  it("keeps a chunk where a comment line is followed by real SQL", () => {
    const sql = "SELECT 1; -- note\nSELECT 2;";
    expect(splitSqlStatements(sql)).toEqual(["SELECT 1", "-- note\nSELECT 2"]);
  });
});
