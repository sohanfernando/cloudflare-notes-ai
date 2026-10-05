import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkText, cleanText } from "../../src/lib/text.ts";

test("cleanText collapses whitespace and keeps paragraph breaks", () => {
  assert.equal(cleanText("  a \t b\r\n\r\n\r\n\r\nc  \n d "), "a b\n\nc\nd");
});

test("cleanText normalizes unicode", () => {
  assert.equal(cleanText("ﬁle name"), "file name");
});

test("chunkText returns nothing for empty text", () => {
  assert.deepEqual(chunkText(""), []);
});

test("chunkText keeps short text as one chunk", () => {
  assert.deepEqual(chunkText("one two three"), ["one two three"]);
});

test("chunkText respects the size limit and overlaps consecutive chunks", () => {
  // Each 4-letter word is estimated as 1 token.
  const words = Array.from({ length: 25 }, (_, i) => `w${String(i).padStart(3, "0")}`);
  const chunks = chunkText(words.join(" "), 10, 2);

  for (const chunk of chunks) assert.ok(chunk.split(" ").length <= 10);
  assert.equal(chunks[0], words.slice(0, 10).join(" "));
  assert.equal(chunks[1], words.slice(8, 18).join(" "));
  assert.equal(chunks.at(-1)?.split(" ").at(-1), "w024");
});

test("chunkText splits a run of characters with no spaces", () => {
  const chunks = chunkText("x".repeat(1000), 50, 5);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.ok(chunk.length <= 250);
});
