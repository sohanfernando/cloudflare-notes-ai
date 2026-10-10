/**
 * Quotes that back up an answer. The model is asked to end its reply with a
 * "QUOTES:" section of passages copied from the context. Nothing in that
 * section is trusted: it is cut out of the visible answer, and each passage is
 * shown as verified only if this code finds it in the text of a retrieved chunk.
 */

import type { Quote } from "../../../shared/types";

/** A chunk that was given to the model as context. */
export interface QuoteSource {
  chunkId: string;
  noteTitle: string;
  content: string;
}

const MAX_QUOTES = 3;
/** Model lines examined; a few more than are shown, in case some fail the check. */
const MAX_QUOTE_LINES = 6;
/** Shorter quotes could match by accident and say nothing useful. */
const MIN_QUOTE_CHARS = 15;
const MAX_QUOTE_CHARS = 320;
/** Sentences picked by the fallback when the model supplied no usable quote. */
const MAX_FALLBACK_QUOTES = 2;

// --- Separating the answer from the quotes section ---

const MARKER = "QUOTES";
/** Markdown decoration a model may put around the marker, e.g. "**QUOTES:**" or "## QUOTES". */
const LINE_DECORATION = /^[ \t*_#>-]+/;

/** True for a line that starts the quotes section. */
function isMarkerLine(line: string): boolean {
  return /^QUOTES\b/.test(line.replace(LINE_DECORATION, ""));
}

/** True while an unfinished line could still turn out to be the marker line. */
function couldBecomeMarker(partialLine: string): boolean {
  return MARKER.startsWith(partialLine.replace(LINE_DECORATION, ""));
}

/**
 * Passes streamed answer text through and stops at the quotes section, so the
 * section never reaches the reader. Text is only held back while the start of
 * a line could still be the marker, which keeps the stream flowing normally.
 */
export class AnswerStreamFilter {
  private held = "";
  private atLineStart = true;
  private done = false;
  private received = "";
  private shownText = false;

  /** Everything the model has written so far, quotes section included. */
  get reply(): string {
    return this.received;
  }

  /** False while nothing but whitespace has been passed on to the reader. */
  get hasShownText(): boolean {
    return this.shownText;
  }

  /** Takes the next piece of model output and returns the part of it to show. */
  push(delta: string): string {
    this.received += delta;
    const visible = this.filter(delta);
    if (visible.trim()) this.shownText = true;
    return visible;
  }

  private filter(delta: string): string {
    if (this.done) return "";

    let visible = "";
    let text = this.held + delta;
    this.held = "";
    while (text) {
      const newline = text.indexOf("\n");
      const piece = newline === -1 ? text : text.slice(0, newline + 1);
      text = newline === -1 ? "" : text.slice(newline + 1);

      if (this.atLineStart) {
        if (isMarkerLine(piece)) {
          this.done = true;
          return visible;
        }
        if (newline === -1 && couldBecomeMarker(piece)) {
          this.held = piece;
          return visible;
        }
      }
      visible += piece;
      this.atLineStart = newline !== -1;
    }
    return visible;
  }

  /** Call when the stream ends; returns any text that was still being held back. */
  end(): string {
    const rest = this.done ? "" : this.held;
    this.held = "";
    if (rest.trim()) this.shownText = true;
    return rest;
  }
}

/** Splits a complete model reply into the answer and the raw text of its quotes section. */
export function splitAnswer(reply: string): { answer: string; quotesBlock: string } {
  const lines = reply.split("\n");
  const markerIndex = lines.findIndex(isMarkerLine);
  if (markerIndex === -1) return { answer: reply.trimEnd(), quotesBlock: "" };

  // A model may put the first quote on the marker line itself.
  const afterMarker = lines[markerIndex]!.replace(LINE_DECORATION, "").replace(/^QUOTES[:*_\s]*/, "");
  return {
    answer: lines.slice(0, markerIndex).join("\n").trimEnd(),
    quotesBlock: [afterMarker, ...lines.slice(markerIndex + 1)].join("\n"),
  };
}

/**
 * Like `splitAnswer`, but copes with a model that skipped the answer and
 * wrote only its quotes: the passages confirmed in the sources then stand in
 * as the answer, since they are what the model meant to support it with. The
 * answer is empty if there are none of those either.
 */
export function resolveReply(
  reply: string,
  retrieved: QuoteSource[],
): { answer: string; quotesBlock: string } {
  const { answer, quotesBlock } = splitAnswer(reply);
  if (answer.trim()) return { answer, quotesBlock };

  const confirmed = checkQuotes("", quotesBlock, retrieved, []).filter((quote) => quote.verified);
  return { answer: confirmed.map((quote) => quote.text).join(" "), quotesBlock };
}

// --- Checking quotes against the sources ---

/** Reduces text to a form where only the wording matters: case, spacing and quote style are ignored. */
function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

interface ParsedQuote {
  text: string;
  /** 1-based number of the source the model attributed the quote to, if it gave one. */
  sourceNumber: number | null;
}

/** A label a model may put before a quote: "[1]", "(2)", "3.", "[source 4]", "Source 5:". */
const LINE_LABEL = /^(?:[-*•]\s*)?(?:[[(][^\])]*[\])]|(?:source\s*)?\d+\s*[.):-])\s*/i;

/**
 * Reads the quotes a model listed. Models label these lines in many ways, so
 * the text inside quotation marks is taken where there is any, and everything
 * before it is treated as the label.
 */
function parseQuoteLines(quotesBlock: string): ParsedQuote[] {
  const quotes: ParsedQuote[] = [];
  for (const rawLine of quotesBlock.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    // From the first opening mark to the last closing one, so marks inside a passage survive.
    const quoted = /["“](.+)["”]/.exec(line);
    const label = quoted ? line.slice(0, quoted.index) : (LINE_LABEL.exec(line)?.[0] ?? "");
    const text = (quoted ? quoted[1]! : line.slice(label.length)).trim();
    // A line holding only a label, such as "[source 5]", carries no quote.
    if (!text) continue;

    const number = /\d+/.exec(label);
    quotes.push({ text, sourceNumber: number ? Number(number[0]) : null });
    if (quotes.length === MAX_QUOTE_LINES) break;
  }
  return quotes;
}

/**
 * Looks for a quote in the sources. A quote may skip text with "..." as long
 * as every part appears, in order, within one source. Returns the source it
 * was found in, or null.
 */
function findSource(quote: ParsedQuote, sources: QuoteSource[]): QuoteSource | null {
  const parts = quote.text
    .split(/\s*(?:\.{3,}|…)\s*/)
    .map((part) => normalize(part).replace(/^[\s.,;:'"]+|[\s.,;:'"]+$/g, ""))
    .filter(Boolean);
  if (parts.join(" ").length < MIN_QUOTE_CHARS) return null;

  // Try the source the model named first, then the rest: it may have numbered it wrongly.
  const named = quote.sourceNumber === null ? undefined : sources[quote.sourceNumber - 1];
  const candidates = named ? [named, ...sources.filter((source) => source !== named)] : sources;

  for (const source of candidates) {
    const haystack = normalize(source.content);
    let from = 0;
    const found = parts.every((part) => {
      const at = haystack.indexOf(part, from);
      if (at === -1) return false;
      from = at + part.length;
      return true;
    });
    if (found) return source;
  }
  return null;
}

// --- Fallback: choosing supporting sentences when the model gave no usable quote ---

const STOP_WORDS = new Set(
  "the and for are was were with that this from have has had not but you your they their its our will can may must shall should would could into than then them been being each any all per who what when where which how according context note notes".split(
    " ",
  ),
);

/** Words that carry meaning for matching an answer to a sentence. Numbers always count. */
function keyTerms(text: string): Set<string> {
  const terms = normalize(text).match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(terms.filter((term) => /\d/.test(term) || (term.length > 2 && !STOP_WORDS.has(term))));
}

/**
 * Picks the sentences from the sources that share the most key terms with the
 * answer. They are copied from the source text, so they are exact by construction.
 */
function pickSupportingSentences(answer: string, sources: QuoteSource[]): Quote[] {
  const answerTerms = keyTerms(answer);
  const candidates: { quote: Quote; score: number }[] = [];

  for (const source of sources) {
    for (const sentence of source.content.split(/(?<=[.!?])\s+/)) {
      const text = sentence.trim();
      if (text.length < MIN_QUOTE_CHARS || text.length > MAX_QUOTE_CHARS) continue;

      let score = 0;
      // A shared number is stronger evidence than a shared word.
      for (const term of keyTerms(text)) if (answerTerms.has(term)) score += /\d/.test(term) ? 2 : 1;
      if (score >= 2) {
        candidates.push({
          quote: { text, verified: true, chunkId: source.chunkId, noteTitle: source.noteTitle },
          score,
        });
      }
    }
  }

  const seen = new Set<string>();
  return candidates
    .sort((a, b) => b.score - a.score)
    .filter(({ quote }) => {
      // Overlapping chunks contain the same sentence twice.
      const key = normalize(quote.text);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_FALLBACK_QUOTES)
    .map(({ quote }) => quote);
}

/**
 * Produces the quotes to show under an answer.
 *
 * @param answer       The visible answer text.
 * @param quotesBlock  The raw quotes section the model wrote, possibly empty.
 * @param retrieved    Every chunk the model was given; its quotes are checked against all of them.
 * @param cited        The chunks shown as sources; the fallback picks only from these.
 */
export function checkQuotes(
  answer: string,
  quotesBlock: string,
  retrieved: QuoteSource[],
  cited: QuoteSource[],
): Quote[] {
  const seen = new Set<string>();
  const checked: Quote[] = [];
  for (const parsed of parseQuoteLines(quotesBlock)) {
    const key = normalize(parsed.text);
    if (seen.has(key)) continue;
    seen.add(key);

    const source = findSource(parsed, retrieved);
    checked.push({
      text: parsed.text.slice(0, MAX_QUOTE_CHARS),
      verified: source !== null,
      chunkId: source?.chunkId ?? null,
      noteTitle: source?.noteTitle ?? null,
    });
  }

  const verified = checked.filter((quote) => quote.verified);
  const unverified = checked.filter((quote) => !quote.verified);
  // The model's own quotes are preferred; the fallback only fills in when none of them held up.
  const supporting = verified.length > 0 ? verified : pickSupportingSentences(answer, cited);
  return [...supporting, ...unverified].slice(0, MAX_QUOTES);
}
