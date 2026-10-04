import { z } from "zod";
import { MAX_NOTE_BYTES, MAX_TITLE_CHARS } from "../../../shared/types";
import { cleanText } from "../lib/text";
import type { Parsed } from "../types";

const DEFAULT_TITLE_CHARS = 60;

const noteInputSchema = z.object({
  title: z.string().max(MAX_TITLE_CHARS).optional(),
  content: z.string(),
});

export interface NoteInput {
  title: string;
  content: string;
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

  const content = cleanText(result.data.content);
  if (!content) return { ok: false, error: "The note is empty." };
  if (new TextEncoder().encode(content).length > MAX_NOTE_BYTES) {
    return { ok: false, error: `The note is larger than ${MAX_NOTE_BYTES / 1024} KB.` };
  }

  const firstLine = content.split("\n", 1)[0]!;
  const title =
    cleanText(result.data.title ?? "").replace(/\n+/g, " ") ||
    firstLine.slice(0, DEFAULT_TITLE_CHARS);
  return { ok: true, value: { title, content } };
}
