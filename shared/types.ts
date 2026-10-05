/** Types and limits used by both the Worker and the frontend, so the API contract lives in one place. */

export interface NoteSummary {
  id: string;
  title: string;
  createdAt: number;
  sizeBytes: number;
  chunkCount: number;
}

/** One retrieved chunk that an answer was grounded in. */
export interface Citation {
  chunkId: string;
  noteId: string;
  noteTitle: string;
  score: number;
  snippet: string;
}

/** A question the user asked that their notes could not answer. */
export interface Gap {
  id: string;
  question: string;
  askCount: number;
  lastAskedAt: number;
  /** The note the question was limited to when last asked, if any. */
  noteId: string | null;
  /** A note added since then that looks likely to answer it. */
  suggestedNoteId: string | null;
}

/** Custom data parts of a chat message: citations travel to the browser as `data-citations`. */
export type ChatDataParts = {
  citations: Citation[];
};

/** Most text one note can hold in total, however it was uploaded. */
export const MAX_NOTE_BYTES = 1024 * 1024;
/** Most text the Worker accepts in a single request. */
export const MAX_PART_BYTES = 100 * 1024;
/**
 * Size of the parts the browser splits a large note into. Kept well under
 * MAX_PART_BYTES so each request does little work and embeds in one batch.
 */
export const UPLOAD_PART_BYTES = 48 * 1024;
export const MAX_TITLE_CHARS = 200;
export const MAX_QUESTION_CHARS = 500;
