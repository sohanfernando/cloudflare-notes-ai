import { z } from "zod";
import { MAX_PART_BYTES, MAX_TITLE_CHARS } from "../../../shared/types";
import { cleanText } from "../lib/text";
import type { Parsed } from "../types";

const DEFAULT_TITLE_CHARS = 60;

const noteInputSchema = z.object({
  title: z.string().max(MAX_TITLE_CHARS).optional(),
  content: z.string(),
});

const notePartSchema = z.object({ content: z.string() });

export interface NoteInput {
  title: string;
  content: string;
}

/** Cleans note text and checks it against the per-request size limit. */
function parseContent(raw: string): Parsed<string> {
  const content = cleanText(raw);
  if (!content) return { ok: false, error: "The note is empty." };
  if (new TextEncoder().encode(content).length > MAX_PART_BYTES) {
    return {
      ok: false,
      error: `One request can carry at most ${MAX_PART_BYTES / 1024} KB of text.`,
    };
  }
  return { ok: true, value: content };
}

/** Validates and cleans a request body for creating a note. */
export function parseNoteInput(body: unknown): Parsed<NoteInput> {
  const result = noteInputSchema.safeParse(body);
  if (!result.success) {
    return {
      ok: false,
      error: `Expected a "content" string and an optional "title" of at most ${MAX_TITLE_CHARS} characters.`,
    };
  }

  const content = parseContent(result.data.content);
  if (!content.ok) return content;

  const firstLine = content.value.split("\n", 1)[0]!;
  const title =
    cleanText(result.data.title ?? "").replace(/\n+/g, " ") ||
    firstLine.slice(0, DEFAULT_TITLE_CHARS);
  return { ok: true, value: { title, content: content.value } };
}

/** Validates and cleans a request body that appends more text to an existing note. */
export function parseNotePart(body: unknown): Parsed<string> {
  const result = notePartSchema.safeParse(body);
  if (!result.success) return { ok: false, error: 'Expected a "content" string.' };
  return parseContent(result.data.content);
}
