import { MAX_NOTE_BYTES, type NoteSummary } from "../../../shared/types";
import { embedTexts } from "../lib/ai";
import { chunkText } from "../lib/text";
import { createVectorStore } from "../lib/vector-store";
import type { Env } from "../types";
import type { NoteInput } from "../validation/notes";
import { auditStatement, type AuditAction } from "./audit";

/** Put between the parts of a note that was uploaded in several requests. */
const PART_SEPARATOR = "\n\n";

/** The note already holds as much text as one note is allowed to. */
export class NoteTooLargeError extends Error {
  constructor() {
    super(`A note can hold at most ${MAX_NOTE_BYTES / 1024 / 1024} MB of text.`);
    this.name = "NoteTooLargeError";
  }
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Chunks and embeds `text`, stores the vectors tagged with the user's ID, then
 * runs `noteStatement` together with the chunk rows and an audit row.
 * Returns how many chunks were added.
 */
async function ingest(
  env: Env,
  userId: string,
  noteId: string,
  text: string,
  firstChunkIndex: number,
  noteStatement: D1PreparedStatement,
  action: AuditAction,
): Promise<number> {
  const chunks = chunkText(text).map((content, index) => ({
    id: `${noteId}:${firstChunkIndex + index}`,
    content,
  }));

  const embeddings = await embedTexts(
    env,
    chunks.map((chunk) => chunk.content),
  );

  const store = createVectorStore(env);
  await store.upsert(
    chunks.map((chunk, index) => ({
      chunkId: chunk.id,
      noteId,
      userId,
      values: embeddings[index]!,
    })),
  );

  const insertChunk = env.DB.prepare(
    "INSERT INTO chunks (id, note_id, user_id, content) VALUES (?, ?, ?, ?)",
  );
  try {
    // One batch is one transaction: the note change, its chunks and the audit row land together.
    await env.DB.batch([
      noteStatement,
      ...chunks.map((chunk) => insertChunk.bind(chunk.id, noteId, userId, chunk.content)),
      auditStatement(env.DB, userId, action, noteId),
    ]);
  } catch (error) {
    // Don't leave vectors behind that point at rows which were never written.
    await store.deleteByChunkIds(
      userId,
      chunks.map((chunk) => chunk.id),
    );
    throw error;
  }
  return chunks.length;
}

/** Creates a note from its first (or only) part of text. */
export async function createNote(env: Env, userId: string, input: NoteInput): Promise<NoteSummary> {
  const noteId = crypto.randomUUID();
  const createdAt = Date.now();

  const chunkCount = await ingest(
    env,
    userId,
    noteId,
    input.content,
    0,
    env.DB.prepare(
      "INSERT INTO notes (id, user_id, title, content, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(noteId, userId, input.title, input.content, createdAt),
    "note.create",
  );

  return {
    id: noteId,
    title: input.title,
    createdAt,
    sizeBytes: byteLength(input.content),
    chunkCount,
  };
}

/**
 * Adds another part of text to one of the user's notes, which is how a note
 * larger than a single request is uploaded. Returns null if the user has no
 * such note.
 */
export async function appendToNote(
  env: Env,
  userId: string,
  noteId: string,
  content: string,
): Promise<NoteSummary | null> {
  const note = await env.DB.prepare(
    `SELECT n.title, n.created_at, LENGTH(CAST(n.content AS BLOB)) AS size_bytes,
            (SELECT COUNT(*) FROM chunks c WHERE c.note_id = n.id AND c.user_id = n.user_id) AS chunk_count
     FROM notes n
     WHERE n.id = ? AND n.user_id = ?`,
  )
    .bind(noteId, userId)
    .first<{ title: string; created_at: number; size_bytes: number; chunk_count: number }>();
  if (!note) return null;

  const addition = PART_SEPARATOR + content;
  const sizeBytes = note.size_bytes + byteLength(addition);
  if (sizeBytes > MAX_NOTE_BYTES) throw new NoteTooLargeError();

  // New chunks continue the numbering, so every chunk ID in the note stays unique.
  const added = await ingest(
    env,
    userId,
    noteId,
    content,
    note.chunk_count,
    env.DB.prepare("UPDATE notes SET content = content || ? WHERE id = ? AND user_id = ?").bind(
      addition,
      noteId,
      userId,
    ),
    "note.append",
  );

  return {
    id: noteId,
    title: note.title,
    createdAt: note.created_at,
    sizeBytes,
    chunkCount: note.chunk_count + added,
  };
}

export async function listNotes(env: Env, userId: string): Promise<NoteSummary[]> {
  const { results } = await env.DB.prepare(
    `SELECT n.id, n.title, n.created_at, LENGTH(CAST(n.content AS BLOB)) AS size_bytes,
            (SELECT COUNT(*) FROM chunks c WHERE c.note_id = n.id AND c.user_id = n.user_id) AS chunk_count
     FROM notes n
     WHERE n.user_id = ?
     ORDER BY n.created_at DESC`,
  )
    .bind(userId)
    .all<{ id: string; title: string; created_at: number; size_bytes: number; chunk_count: number }>();

  return results.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    sizeBytes: row.size_bytes,
    chunkCount: row.chunk_count,
  }));
}

/**
 * Deletes a note with its chunks and vectors. Returns false if the user has no
 * such note, which is also the answer for a note that belongs to someone else.
 */
export async function deleteNote(env: Env, userId: string, noteId: string): Promise<boolean> {
  const note = await env.DB.prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?")
    .bind(noteId, userId)
    .first();
  if (!note) return false;

  const { results } = await env.DB.prepare(
    "SELECT id FROM chunks WHERE note_id = ? AND user_id = ?",
  )
    .bind(noteId, userId)
    .all<{ id: string }>();

  await createVectorStore(env).deleteByChunkIds(
    userId,
    results.map((row) => row.id),
  );
  await env.DB.batch([
    env.DB.prepare("DELETE FROM chunks WHERE note_id = ? AND user_id = ?").bind(noteId, userId),
    env.DB.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(noteId, userId),
    auditStatement(env.DB, userId, "note.delete", noteId),
  ]);
  return true;
}
