import type { Gap } from "../../../shared/types";
import type { Env } from "../types";

/** Shorter messages are greetings or fragments, not questions worth tracking. */
const MIN_QUESTION_WORDS = 3;
/** Small talk gets "I don't know" too, but it is not something a note could answer. */
const SMALL_TALK = /^\W*(hi|hello|hey|thanks|thank you|good (morning|afternoon|evening)|how are you)\b/i;
const MAX_GAPS_LISTED = 50;
/** How many open gaps each newly added piece of note text is compared with. */
const MAX_GAPS_CHECKED = 20;
/**
 * How much better than the old best match new note text must score before it
 * is suggested for a gap. Comparing against the gap's own baseline, rather
 * than a fixed score, works across embedding models with different scales.
 */
const SUGGESTION_MARGIN = 0.05;

/** Reduces a question to a form in which repeats of it compare equal. */
function questionKey(question: string): string {
  return question
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s?!.]+$/, "")
    .trim();
}

// Embeddings are stored as raw float32 bytes: a tenth the size of JSON and no parsing on read.
function encodeEmbedding(embedding: number[]): ArrayBuffer {
  return new Float32Array(embedding).buffer;
}

function decodeEmbedding(blob: ArrayBuffer | number[]): Float32Array {
  const bytes = blob instanceof ArrayBuffer ? new Uint8Array(blob) : Uint8Array.from(blob);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

function cosineSimilarity(a: Float32Array, b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

export interface AnsweredQuestion {
  question: string;
  /** The question's embedding, kept so later notes can be compared with it. */
  embedding: number[];
  /** Similarity of the best chunk retrieved for it. */
  bestScore: number;
  /** The note the question was limited to, if any. */
  noteId?: string;
  /** False when the model replied that the notes don't contain the answer. */
  answered: boolean;
}

/**
 * Keeps the user's gaps in step with an answer: a question the notes could not
 * answer is recorded (or its count raised), and one that now gets a real
 * answer is removed. Never throws: tracking gaps must not break the chat.
 */
export async function trackGap(env: Env, userId: string, asked: AnsweredQuestion): Promise<void> {
  const key = questionKey(asked.question);
  try {
    if (asked.answered) {
      await env.DB.prepare("DELETE FROM gaps WHERE user_id = ? AND question_key = ?")
        .bind(userId, key)
        .run();
      return;
    }
    if (asked.question.trim().split(/\s+/).length < MIN_QUESTION_WORDS) return;
    if (SMALL_TALK.test(asked.question)) return;

    const now = Date.now();
    // Asking again without an answer also clears any suggestion, since it did not help.
    await env.DB.prepare(
      `INSERT INTO gaps (id, user_id, question, question_key, embedding, best_score, note_id, created_at, last_asked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, question_key) DO UPDATE SET
         ask_count = ask_count + 1,
         last_asked_at = excluded.last_asked_at,
         best_score = excluded.best_score,
         note_id = excluded.note_id,
         suggested_note_id = NULL`,
    )
      .bind(
        crypto.randomUUID(),
        userId,
        asked.question,
        key,
        encodeEmbedding(asked.embedding),
        asked.bestScore,
        asked.noteId ?? null,
        now,
        now,
      )
      .run();
  } catch (error) {
    console.error("tracking a gap failed", error);
  }
}

/**
 * Marks the user's open gaps that newly added note text looks likely to
 * answer: those whose question matches a new chunk clearly better than
 * anything the notes offered when the question went unanswered. It is only a
 * hint: a gap closes when its question is asked again and actually answered.
 * Never throws: this must not fail the upload it runs after.
 */
export async function suggestNoteForGaps(
  env: Env,
  userId: string,
  noteId: string,
  chunkEmbeddings: number[][],
): Promise<void> {
  // A suggested note should at least be one that would be shown as a source.
  const floor = Number(env.CITATION_MIN_SCORE) || 0;

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, embedding, best_score FROM gaps
       WHERE user_id = ? AND suggested_note_id IS NULL
       ORDER BY last_asked_at DESC
       LIMIT ?`,
    )
      .bind(userId, MAX_GAPS_CHECKED)
      .all<{ id: string; embedding: ArrayBuffer | number[]; best_score: number }>();

    const matched = results.filter((gap) => {
      const question = decodeEmbedding(gap.embedding);
      const minScore = Math.max(floor, gap.best_score + SUGGESTION_MARGIN);
      return chunkEmbeddings.some((chunk) => cosineSimilarity(question, chunk) >= minScore);
    });
    if (matched.length === 0) return;

    const update = env.DB.prepare(
      "UPDATE gaps SET suggested_note_id = ? WHERE id = ? AND user_id = ?",
    );
    await env.DB.batch(matched.map((gap) => update.bind(noteId, gap.id, userId)));
  } catch (error) {
    console.error("matching gaps against a new note failed", error);
  }
}

/** The user's open gaps, most recently asked first. */
export async function listGaps(env: Env, userId: string): Promise<Gap[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, question, ask_count, last_asked_at, note_id, suggested_note_id
     FROM gaps
     WHERE user_id = ?
     ORDER BY last_asked_at DESC
     LIMIT ?`,
  )
    .bind(userId, MAX_GAPS_LISTED)
    .all<{
      id: string;
      question: string;
      ask_count: number;
      last_asked_at: number;
      note_id: string | null;
      suggested_note_id: string | null;
    }>();

  return results.map((row) => ({
    id: row.id,
    question: row.question,
    askCount: row.ask_count,
    lastAskedAt: row.last_asked_at,
    noteId: row.note_id,
    suggestedNoteId: row.suggested_note_id,
  }));
}

/** Removes a gap the user no longer cares about. Returns false if they have no such gap. */
export async function dismissGap(env: Env, userId: string, gapId: string): Promise<boolean> {
  const result = await env.DB.prepare("DELETE FROM gaps WHERE id = ? AND user_id = ?")
    .bind(gapId, userId)
    .run();
  return result.meta.changes > 0;
}
