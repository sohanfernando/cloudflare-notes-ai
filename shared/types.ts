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

/** Custom data parts of a chat message: citations travel to the browser as `data-citations`. */
export type ChatDataParts = {
  citations: Citation[];
};

export const MAX_NOTE_BYTES = 100 * 1024;
export const MAX_TITLE_CHARS = 200;
export const MAX_QUESTION_CHARS = 500;
