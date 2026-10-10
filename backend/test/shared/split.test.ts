import assert from "node:assert/strict";
import { test } from "node:test";
import { splitIntoParts } from "../../../shared/split.ts";

const bytes = (text: string) => new TextEncoder().encode(text).length;

test("short text stays in one part", () => {
  assert.deepEqual(splitIntoParts("hello world", 100), ["hello world"]);
});

test("empty and whitespace-only text gives no parts", () => {
  assert.deepEqual(splitIntoParts("", 100), []);
  assert.deepEqual(splitIntoParts("  \n \n ", 100), []);
});

test("parts respect the byte limit and lose no text", () => {
  const text = Array.from({ length: 500 }, (_, i) => `line number ${i} of the document`).join("\n");
  const parts = splitIntoParts(text, 1000);

  assert.ok(parts.length > 1);
  for (const part of parts) assert.ok(bytes(part) <= 1000);
  assert.equal(parts.join(""), text);
});

test("parts break at whitespace rather than inside a word", () => {
  const text = Array.from({ length: 200 }, () => "abcdefghij").join(" ");
  for (const part of splitIntoParts(text, 256)) {
    assert.match(part.trim(), /^(abcdefghij ?)+$/);
  }
});

test("multi-byte text is measured in bytes, not characters", () => {
  const text = "සිංහල ".repeat(400); // each letter is 3 bytes in UTF-8
  const parts = splitIntoParts(text, 600);

  for (const part of parts) assert.ok(bytes(part) <= 600);
  assert.equal(parts.join(""), text);
});

test("text with no spaces is still split, without breaking emoji", () => {
  const text = "😀".repeat(300); // 4 bytes and 2 UTF-16 units each
  const parts = splitIntoParts(text, 100);

  for (const part of parts) {
    assert.ok(bytes(part) <= 100);
    assert.ok(!part.includes("�"));
    assert.equal(part.length % 2, 0);
  }
  assert.equal(parts.join(""), text);
});
