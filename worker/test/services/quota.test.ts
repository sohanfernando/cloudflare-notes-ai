import assert from "node:assert/strict";
import { test } from "node:test";
import { readLimit, usageDay } from "../../src/services/quota.ts";

test("readLimit uses the configured number", () => {
  assert.equal(readLimit("50", 20), 50);
  assert.equal(readLimit("0", 20), 0);
  assert.equal(readLimit("12.9", 20), 12);
});

test("readLimit falls back when the value is missing or not a usable number", () => {
  assert.equal(readLimit(undefined, 20), 20);
  assert.equal(readLimit("", 20), 20);
  assert.equal(readLimit("  ", 20), 20);
  assert.equal(readLimit("many", 20), 20);
  assert.equal(readLimit("-5", 20), 20);
  assert.equal(readLimit("Infinity", 20), 20);
});

test("usageDay is the UTC date, so limits reset at midnight UTC", () => {
  assert.equal(usageDay(new Date("2026-10-06T23:59:59Z")), "2026-10-06");
  assert.equal(usageDay(new Date("2026-10-07T00:00:00Z")), "2026-10-07");
  // 01:30 in Sri Lanka on the 7th is still the 6th in UTC.
  assert.equal(usageDay(new Date("2026-10-07T01:30:00+05:30")), "2026-10-06");
});
