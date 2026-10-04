import type { NoteSummary } from "../../../shared/types";
import { embedTexts } from "../lib/ai";
import { chunkText } from "../lib/text";
import { createVectorStore } from "../lib/vector-store";
import type { Env } from "../types";
import type { NoteInput } from "../validation/notes";
import { auditStatement } from "./audit";

/** Ingests a note: chunk, embed, then store vectors and rows tagged with the user's ID. */
export async function createNote(env: Env, userId: string, input: NoteInput): Promise<NoteSummary> {
  const noteId = crypto.randomUUID();
  const createdAt = Date.now();
  const chunks = chunkText(input.content).map((content, index) => ({
    id: `${noteId}:${index}`,
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
    // One batch is one transaction: the note, its chunks and the audit row land together.
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO notes (id, user_id, title, content, created_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(noteId, userId, input.title, input.content, createdAt),
      ...chunks.map((chunk) => insertChunk.bind(chunk.id, noteId, userId, chunk.content)),
      auditStatement(env.DB, userId, "note.create", noteId),
    ]);
  } catch (error) {
    // Don't leave vectors behind that point at rows which were never written.
    await store.deleteByChunkIds(
      userId,
      chunks.map((chunk) => chunk.id),
    );
    throw error;
  }

  return {
    id: noteId,
    title: input.title,
    createdAt,
    sizeBytes: new TextEncoder().encode(input.content).length,
    chunkCount: chunks.length,
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
