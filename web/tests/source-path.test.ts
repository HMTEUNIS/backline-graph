import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isSafeSourcePath, sourceHref } from "../src/lib/source-path.ts";

describe("source paths", () => {
  it("prefixes a stored relative path", () => {
    assert.equal(isSafeSourcePath("imani-ledger/base/FBR-C-00506_imani-ledger.pdf"), true);
    assert.equal(
      sourceHref("imani-ledger/base/FBR-C-00506_imani-ledger.pdf"),
      "/api/documents/imani-ledger/base/FBR-C-00506_imani-ledger.pdf",
    );
  });

  it("refuses a path that leaves the document folder", () => {
    assert.equal(isSafeSourcePath("../package.json"), false);
    assert.equal(isSafeSourcePath("/etc/passwd"), false);
    assert.equal(isSafeSourcePath("imani-ledger/../../server/.env"), false);
    assert.equal(isSafeSourcePath("notes.txt"), false);
    assert.equal(sourceHref("../package.json"), null);
  });
});
