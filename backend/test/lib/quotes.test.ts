import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AnswerStreamFilter,
  checkQuotes,
  resolveReply,
  splitAnswer,
  type QuoteSource,
} from "../../src/lib/quotes.ts";

const handbook: QuoteSource = {
  chunkId: "note-1:0",
  noteTitle: "Handbook",
  content:
    "Espresso is the foundation of the menu. The house recipe is 18 grams of ground coffee in, 36 grams of espresso out, in 27 to 31 seconds, at a water temperature of 93 degrees Celsius. Milk is steamed to between 60 and 65 degrees Celsius and never reheated.",
};
const leave: QuoteSource = {
  chunkId: "note-1:1",
  noteTitle: "Handbook",
  content:
    "Full-time staff receive 14 days of annual leave, 7 days of casual leave and 7 days of sick leave each calendar year. Salaries are paid on the 25th of each month.",
};
const sources = [handbook, leave];

/** Feeds text to the filter in pieces of the given sizes, cycling through them. */
function streamThrough(text: string, sizes: number[]): string {
  const filter = new AnswerStreamFilter();
  let visible = "";
  for (let at = 0, i = 0; at < text.length; i++) {
    const size = sizes[i % sizes.length]!;
    visible += filter.push(text.slice(at, at + size));
    at += size;
  }
  return visible + filter.end();
}

// --- splitting the answer from the quotes section ---

test("splitAnswer separates the answer from the quotes section", () => {
  const reply = 'The recipe uses 18 grams.\n\nQUOTES:\n[1] "The house recipe is 18 grams"';
  assert.deepEqual(splitAnswer(reply), {
    answer: "The recipe uses 18 grams.",
    quotesBlock: '\n[1] "The house recipe is 18 grams"',
  });
});

test("splitAnswer returns the whole reply when there is no quotes section", () => {
  assert.deepEqual(splitAnswer("I don't know."), { answer: "I don't know.", quotesBlock: "" });
});

test("splitAnswer accepts a decorated marker and a quote on the marker line", () => {
  assert.equal(splitAnswer("Answer.\n**QUOTES:**\n- one").answer, "Answer.");
  assert.equal(splitAnswer("Answer.\n## QUOTES\n- one").answer, "Answer.");
  assert.equal(splitAnswer('Answer.\nQUOTES: [1] "on the same line"').quotesBlock, '[1] "on the same line"');
});

test("the word quotes inside an answer is not mistaken for the marker", () => {
  const reply = "The handbook quotes a price.\nQuotes are listed below.\nNo QUOTES here either.";
  assert.equal(splitAnswer(reply).answer, reply);
  assert.equal(streamThrough(reply, [3]), reply);
});

test("the stream filter shows exactly the answer, however the text is split up", () => {
  const replies = [
    'The recipe uses 18 grams.\n\nQUOTES:\n[1] "The house recipe is 18 grams"',
    "Steps:\n- Mash 3 bananas\n- Bake at 175C\n\n**QUOTES:**\n- \"Mash 3 ripe bananas\"",
    "A reply with no quotes section at all.",
    "QUOTES:\n[1] \"nothing but quotes\"",
    "Ends on a line that looks like the start of the marker\nQUO",
    "I don't know.",
  ];
  for (const reply of replies) {
    for (const sizes of [[1], [2], [5], [7, 1, 3], [1000]]) {
      const shown = streamThrough(reply, sizes);
      assert.equal(shown.trimEnd(), splitAnswer(reply).answer, `sizes ${sizes} for: ${reply}`);
      assert.ok(!shown.includes("QUOTES:"), `marker leaked with sizes ${sizes}`);
    }
  }
});

test("the stream filter holds back at most a possible marker", () => {
  const filter = new AnswerStreamFilter();
  assert.equal(filter.push("Hello wor"), "Hello wor");
  assert.equal(filter.push("ld\nQU"), "ld\n");
  assert.equal(filter.push("ite right"), "QUite right");
});

// --- checking quotes ---

test("an exact quote is verified and attributed to its source", () => {
  const quotes = checkQuotes("14 days.", '[2] "Full-time staff receive 14 days of annual leave"', sources, sources);
  assert.deepEqual(quotes, [
    {
      text: "Full-time staff receive 14 days of annual leave",
      verified: true,
      chunkId: "note-1:1",
      noteTitle: "Handbook",
    },
  ]);
});

test("case, spacing, quote style and a wrong source number do not prevent verification", () => {
  const block = '[1] “full-time  staff RECEIVE 14 days of annual leave”';
  const [quote] = checkQuotes("14 days.", block, sources, sources);
  assert.equal(quote?.verified, true);
  assert.equal(quote?.chunkId, "note-1:1");
});

test("a quote that skips text with an ellipsis is verified if the parts appear in order", () => {
  const ok = checkQuotes("x", '[1] "The house recipe is 18 grams ... at a water temperature of 93 degrees"', sources, []);
  assert.equal(ok[0]?.verified, true);

  const reversed = checkQuotes("x", '[1] "at a water temperature of 93 degrees ... The house recipe is 18 grams"', sources, []);
  assert.equal(reversed[0]?.verified, false);
});

test("a paraphrase or an altered number is not verified", () => {
  const block = [
    '[1] "The house recipe uses 18 grams of coffee and yields 36 grams"',
    '[1] "at a water temperature of 95 degrees Celsius"',
  ].join("\n");
  const quotes = checkQuotes("x", block, sources, []);
  assert.deepEqual(
    quotes.map((quote) => [quote.verified, quote.chunkId]),
    [
      [false, null],
      [false, null],
    ],
  );
});

test("a quote too short to mean anything is not verified", () => {
  assert.equal(checkQuotes("x", '[1] "18 grams"', sources, [])[0]?.verified, false);
});

test("a quote spanning two sources is not verified", () => {
  const block = '[1] "never reheated ... Salaries are paid on the 25th"';
  assert.equal(checkQuotes("x", block, sources, [])[0]?.verified, false);
});

test("verified quotes come first and at most three are returned", () => {
  const block = [
    '"this sentence is not in any source at all"',
    '"Salaries are paid on the 25th of each month"',
    '"Espresso is the foundation of the menu"',
    '"Milk is steamed to between 60 and 65 degrees Celsius"',
    '"another sentence that was simply made up"',
  ].join("\n");
  const quotes = checkQuotes("x", block, sources, sources);
  assert.deepEqual(
    quotes.map((quote) => quote.verified),
    [true, true, true],
  );
});

test("repeated quotes are listed once", () => {
  const block = '"Salaries are paid on the 25th of each month"\n"salaries are paid on the 25th of each month"';
  assert.equal(checkQuotes("x", block, sources, sources).length, 1);
});

// --- fallback ---

test("with no quotes from the model, supporting sentences are taken from the cited sources", () => {
  const quotes = checkQuotes("Salaries are paid on the 25th of each month.", "", sources, [leave]);
  assert.equal(quotes[0]?.text, "Salaries are paid on the 25th of each month.");
  assert.equal(quotes[0]?.verified, true);
  assert.ok(leave.content.includes(quotes[0]!.text));
});

test("when the model's quotes all fail, the fallback adds verified ones and the failures stay flagged", () => {
  const quotes = checkQuotes(
    "The water temperature is 93 degrees Celsius.",
    '[1] "the water should be heated to 93 degrees"',
    sources,
    [handbook],
  );
  assert.equal(quotes[0]?.verified, true);
  assert.ok(handbook.content.includes(quotes[0]!.text));
  assert.equal(quotes.at(-1)?.verified, false);
});

test("the fallback picks nothing when no source is cited or nothing in it relates to the answer", () => {
  assert.deepEqual(checkQuotes("Nice to meet you!", "", sources, []), []);
  assert.deepEqual(checkQuotes("Nice to meet you!", "", sources, sources), []);
});

test("every fallback quote is an exact substring of its source", () => {
  const answer = "Staff get 14 days of annual leave and the recipe uses 18 grams at 93 degrees.";
  const quotes = checkQuotes(answer, "", sources, sources);
  assert.ok(quotes.length > 0);
  for (const quote of quotes) {
    const source = sources.find((candidate) => candidate.chunkId === quote.chunkId);
    assert.ok(source?.content.includes(quote.text));
  }
});

// --- replies from models that do not follow the format ---

test("quotes are read whatever label the model puts in front of them", () => {
  const block = [
    '[source 2] "Salaries are paid on the 25th of each month."',
    '[source number] "Full-time staff receive 14 days of annual leave"',
    'Source 1: "Espresso is the foundation of the menu."',
    "[source 5]",
  ].join("\n");
  const quotes = checkQuotes("x", block, sources, []);
  assert.equal(quotes.length, 3);
  assert.ok(quotes.every((quote) => quote.verified));
  assert.ok(quotes.every((quote) => !/source/i.test(quote.text)));
});

test("quotes without quotation marks are read after their label", () => {
  const block = ["- (1) Milk is steamed to between 60 and 65 degrees Celsius", "2. 'Salaries are paid on the 25th of each month'"].join("\n");
  const quotes = checkQuotes("x", block, sources, []);
  assert.deepEqual(
    quotes.map((quote) => [quote.verified, quote.chunkId]),
    [
      [true, "note-1:0"],
      [true, "note-1:1"],
    ],
  );
});

test("resolveReply leaves a normal reply alone", () => {
  const reply = 'On the 25th.\nQUOTES:\n[2] "Salaries are paid on the 25th of each month."';
  assert.equal(resolveReply(reply, sources).answer, "On the 25th.");
});

test("when the model writes only quotes, the confirmed ones become the answer", () => {
  const reply = 'QUOTES:\n[2] "Salaries are paid on the 25th of each month."\n[2] "They are paid weekly in cash."';
  assert.equal(resolveReply(reply, sources).answer, "Salaries are paid on the 25th of each month.");
});

test("a reply with neither an answer nor a confirmed quote resolves to nothing", () => {
  assert.equal(resolveReply('QUOTES:\n"something that is not in the notes at all"', sources).answer, "");
  assert.equal(resolveReply("", sources).answer, "");
});

test("the stream filter reports whether it showed anything and keeps the whole reply", () => {
  const onlyQuotes = new AnswerStreamFilter();
  onlyQuotes.push("\n");
  onlyQuotes.push('QUOTES:\n[1] "Espresso is the foundation of the menu."');
  onlyQuotes.end();
  assert.equal(onlyQuotes.hasShownText, false);
  assert.equal(onlyQuotes.reply, '\nQUOTES:\n[1] "Espresso is the foundation of the menu."');

  const normal = new AnswerStreamFilter();
  normal.push("An answer.\nQUOTES:\n");
  assert.equal(normal.hasShownText, true);
});
