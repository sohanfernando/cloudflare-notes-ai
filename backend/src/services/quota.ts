import type { Env } from "../types";

// Defaults for the per-user limits. Each can be overridden with a variable of
// the same purpose (see wrangler.toml), which is how local development lifts them.
const DEFAULT_MAX_NOTES = 20;
const DEFAULT_MAX_CHUNKS = 1000;
const DEFAULT_MAX_QUESTIONS_PER_DAY = 30;

/** A user has reached one of their limits. The message is written for the user. */
export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

/** Reads a limit from configuration, falling back to the default if it is unset or not a number. */
export function readLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value !== undefined && value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : fallback;
}

/** The current day in UTC, which is when daily limits reset. */
export function usageDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Counts one question against the user's allowance for today and throws if
 * they are over it. Counting and checking are one statement, so two questions
 * sent at the same moment cannot both slip under the limit.
 */
export async function countQuestion(env: Env, userId: string): Promise<void> {
  const limit = readLimit(env.MAX_QUESTIONS_PER_DAY, DEFAULT_MAX_QUESTIONS_PER_DAY);

  let used: number;
  try {
    const row = await env.DB.prepare(
      `INSERT INTO usage (user_id, day, questions) VALUES (?, ?, 1)
       ON CONFLICT (user_id, day) DO UPDATE SET questions = questions + 1
       RETURNING questions`,
    )
      .bind(userId, usageDay())
      .first<{ questions: number }>();
    used = row?.questions ?? 0;
  } catch (error) {
    // Answering without counting beats refusing everyone if the counter is unavailable.
    console.error("counting a question failed", error);
    return;
  }

  if (used > limit) {
    throw new QuotaExceededError(
      `You've used today's ${limit} questions. The limit resets at midnight UTC.`,
    );
  }
}

/**
 * Throws if the user may not add more note text: they already have the most
 * notes allowed (checked only when `creating` a note), or their notes already
 * hold the most text allowed. The text limit is in chunks because that is what
 * the vector index, the scarcest shared resource, is measured in.
 */
export async function checkNoteQuota(env: Env, userId: string, creating: boolean): Promise<void> {
  const maxNotes = readLimit(env.MAX_NOTES_PER_USER, DEFAULT_MAX_NOTES);
  const maxChunks = readLimit(env.MAX_CHUNKS_PER_USER, DEFAULT_MAX_CHUNKS);

  const row = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM notes WHERE user_id = ?) AS notes,
            (SELECT COUNT(*) FROM chunks WHERE user_id = ?) AS chunks`,
  )
    .bind(userId, userId)
    .first<{ notes: number; chunks: number }>();

  if (creating && (row?.notes ?? 0) >= maxNotes) {
    throw new QuotaExceededError(
      `You've reached the limit of ${maxNotes} notes. Delete one to add another.`,
    );
  }
  if ((row?.chunks ?? 0) >= maxChunks) {
    throw new QuotaExceededError(
      "Your notes have reached the storage limit. Delete a note to free up space.",
    );
  }
}
