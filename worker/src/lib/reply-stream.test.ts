import assert from "node:assert/strict";
import { test } from "node:test";
import { AnswerStreamFilter } from "./quotes.ts";
import { shapeReply, type ChatChunk } from "./reply-stream.ts";

const QUOTES: ChatChunk = {
  type: "data-quotes",
  data: [{ text: "a quote", verified: true, chunkId: "n:0", noteTitle: "Note" }],
};

/** Runs chunks through shapeReply and returns what comes out, plus the reply the hooks were given. */
async function run(input: ChatChunk[], answerWhenEmpty = "FALLBACK ANSWER") {
  const described: string[] = [];
  const source = new ReadableStream<ChatChunk>({
    start(controller) {
      for (const chunk of input) controller.enqueue(chunk);
      controller.close();
    },
  });
  const shaped = shapeReply(source, new AnswerStreamFilter(), {
    answerFor: () => answerWhenEmpty,
    describe: async (reply) => {
      described.push(reply);
      return [QUOTES];
    },
  });

  const output: ChatChunk[] = [];
  for await (const chunk of shaped) output.push(chunk);
  const text = output.map((chunk) => (chunk.type === "text-delta" ? chunk.delta : "")).join("");
  return { output, types: output.map((chunk) => chunk.type), text, described };
}

const start: ChatChunk = { type: "text-start", id: "t" };
const end: ChatChunk = { type: "text-end", id: "t" };
const delta = (text: string): ChatChunk => ({ type: "text-delta", id: "t", delta: text });

test("a normal reply shows the answer, hides the quotes section and adds the described chunks", async () => {
  const reply = 'The answer.\nQUOTES:\n[1] "a quote"';
  const result = await run([start, delta("The ans"), delta("wer.\nQUO"), delta('TES:\n[1] "a quote"'), end, { type: "finish" }]);

  assert.equal(result.text, "The answer.\n");
  assert.deepEqual(result.types, ["text-start", "text-delta", "text-delta", "text-end", "data-quotes", "finish"]);
  assert.deepEqual(result.described, [reply]);
});

test("a reply cut off inside its quotes section is completed, not reported as an error", async () => {
  // What Workers AI does at its output limit: the text just stops, with no end or finish event.
  const result = await run([start, delta("The answer.\nQUOTES:\n"), delta('[1] "a quote that is cut o')]);

  assert.equal(result.text, "The answer.\n");
  assert.deepEqual(result.types, ["text-start", "text-delta", "text-end", "data-quotes", "finish"]);
  assert.equal(result.described.length, 1);
});

test("an error after the answer is on screen is absorbed and the reply is still described", async () => {
  const result = await run([start, delta("The answer.\nQUOTES:\n"), { type: "error", errorText: "boom" }]);

  assert.ok(!result.types.includes("error"));
  assert.equal(result.text, "The answer.\n");
  assert.deepEqual(result.types, ["text-start", "text-delta", "text-end", "data-quotes", "finish"]);
});

test("an error before any answer text is passed on untouched", async () => {
  const result = await run([{ type: "error", errorText: "the model is down" }]);

  assert.deepEqual(result.output, [{ type: "error", errorText: "the model is down" }]);
  assert.deepEqual(result.described, []);
});

test("an error after an empty text block is still passed on", async () => {
  const result = await run([start, { type: "error", errorText: "boom" }]);
  assert.deepEqual(result.types, ["text-start", "error"]);
});

test("a reply that is only a quotes section gets the supplied answer", async () => {
  const result = await run([start, delta('QUOTES:\n[1] "a quote"'), end, { type: "finish" }]);

  assert.equal(result.text, "FALLBACK ANSWER");
  assert.deepEqual(result.types, ["text-start", "text-delta", "text-end", "data-quotes", "finish"]);
});

test("the reply is described exactly once and finish is sent exactly once", async () => {
  const result = await run([start, delta("Answer."), end, { type: "finish" }]);

  assert.equal(result.described.length, 1);
  assert.equal(result.types.filter((type) => type === "finish").length, 1);
  assert.equal(result.types.filter((type) => type === "data-quotes").length, 1);
});

test("text held back as a possible marker is released when the reply ends", async () => {
  const result = await run([start, delta("Answer\nQUO"), end, { type: "finish" }]);
  assert.equal(result.text, "Answer\nQUO");
});

test("chunks that are not text pass straight through", async () => {
  const result = await run([{ type: "start-step" }, start, delta("Answer."), end, { type: "finish-step" }, { type: "finish" }]);
  assert.deepEqual(result.types, ["start-step", "text-start", "text-delta", "text-end", "finish-step", "data-quotes", "finish"]);
});
