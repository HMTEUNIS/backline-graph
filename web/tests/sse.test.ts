import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSse } from "../src/lib/sse.ts";

describe("sse", () => {
  it("reads a final event and skips the keepalive", () => {
    const buffer = ": keepalive\n\nevent: final\ndata: {\"text\":\"ok\"}\n\n";
    const parsed = parseSse(buffer);
    assert.equal(parsed.rest, "");
    assert.equal(parsed.events.length, 1);
    assert.equal(parsed.events[0]?.event, "final");
    assert.equal(parsed.events[0]?.data, "{\"text\":\"ok\"}");
  });

  it("keeps a partial frame", () => {
    const parsed = parseSse("event: routed\ndata: {\"demo\":true}");
    assert.deepEqual(parsed.events, []);
    assert.match(parsed.rest, /routed/);
  });
});
