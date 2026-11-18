import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { assertSafeSql } from "../src/db.js";

describe("sql gate", () => {
  it("rejects the truth schema", () => {
    assert.throws(() => assertSafeSql("SELECT * FROM truth.qa_answer_key"), /truth/);
    assert.throws(() => assertSafeSql('SELECT * FROM "truth".expected_ledger'), /truth/);
  });

  it("rejects writes", () => {
    assert.throws(() => assertSafeSql("UPDATE label.artists SET country = 'US'"), /read/);
    assert.throws(() => assertSafeSql("SELECT 1; DELETE FROM label.artists"), /read/);
  });

  it("allows a label read", () => {
    assert.doesNotThrow(() => assertSafeSql("SELECT id FROM label.artists WHERE id = $1"));
  });

  it("does not name the truth schema in a loader query", () => {
    const src = readFileSync(fileURLToPath(new URL("../src/load.ts", import.meta.url)), "utf8");
    const queries = src.match(/`[\s\S]*?`/g) ?? [];
    assert.ok(queries.length >= 3);
    for (const sql of queries) {
      assert.doesNotMatch(sql, /\btruth\b/i);
    }
  });
});
