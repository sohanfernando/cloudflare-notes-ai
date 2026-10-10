import { cosineSimilarity } from "ai";
import type { Env } from "../types";

export interface VectorRecord {
  chunkId: string;
  noteId: string;
  userId: string;
  values: number[];
}

export interface VectorMatch {
  chunkId: string;
  score: number;
}

/** Vector index in which every read and delete is scoped to a single user. */
export interface VectorStore {
  upsert(records: VectorRecord[]): Promise<void>;
  /** Finds the user's most similar chunks, optionally only within one of their notes. */
  query(userId: string, values: number[], topK: number, noteId?: string): Promise<VectorMatch[]>;
  deleteByChunkIds(userId: string, chunkIds: string[]): Promise<void>;
}

/** IDs per Vectorize delete call; a large note has several hundred chunks. */
const DELETE_BATCH_SIZE = 100;

/**
 * Production store. The index needs metadata indexes on `user_id` and
 * `note_id`, created before any vectors are inserted, for the query filters
 * to apply. Vectors inserted before an index existed are invisible to its filter.
 */
class VectorizeStore implements VectorStore {
  constructor(private readonly index: Vectorize) {}

  async upsert(records: VectorRecord[]): Promise<void> {
    await this.index.upsert(
      records.map((record) => ({
        id: record.chunkId,
        values: record.values,
        metadata: { user_id: record.userId, note_id: record.noteId, chunk_id: record.chunkId },
      })),
    );
  }

  async query(
    userId: string,
    values: number[],
    topK: number,
    noteId?: string,
  ): Promise<VectorMatch[]> {
    const { matches } = await this.index.query(values, {
      topK,
      // user_id is always part of the filter, so a note ID from another user matches nothing.
      filter: noteId ? { user_id: userId, note_id: noteId } : { user_id: userId },
      returnMetadata: "none",
    });
    return matches.map((match) => ({ chunkId: match.id, score: match.score }));
  }

  // Vectorize deletes by ID only; callers pass IDs already read from D1 with a user_id filter.
  async deleteByChunkIds(_userId: string, chunkIds: string[]): Promise<void> {
    for (let start = 0; start < chunkIds.length; start += DELETE_BATCH_SIZE) {
      await this.index.deleteByIds(chunkIds.slice(start, start + DELETE_BATCH_SIZE));
    }
  }
}

/** Local development store: embeddings in D1, compared by brute-force cosine similarity. */
class D1VectorStore implements VectorStore {
  constructor(private readonly db: D1Database) {}

  async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return;
    const statement = this.db.prepare(
      "INSERT OR REPLACE INTO local_vectors (chunk_id, note_id, user_id, embedding) VALUES (?, ?, ?, ?)",
    );
    await this.db.batch(
      records.map((record) =>
        statement.bind(record.chunkId, record.noteId, record.userId, JSON.stringify(record.values)),
      ),
    );
  }

  async query(
    userId: string,
    values: number[],
    topK: number,
    noteId?: string,
  ): Promise<VectorMatch[]> {
    const statement = noteId
      ? this.db
          .prepare("SELECT chunk_id, embedding FROM local_vectors WHERE user_id = ? AND note_id = ?")
          .bind(userId, noteId)
      : this.db
          .prepare("SELECT chunk_id, embedding FROM local_vectors WHERE user_id = ?")
          .bind(userId);
    const { results } = await statement.all<{ chunk_id: string; embedding: string }>();

    return results
      .map((row) => ({
        chunkId: row.chunk_id,
        score: cosineSimilarity(values, JSON.parse(row.embedding) as number[]),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async deleteByChunkIds(userId: string, chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0) return;
    const statement = this.db.prepare(
      "DELETE FROM local_vectors WHERE user_id = ? AND chunk_id = ?",
    );
    await this.db.batch(chunkIds.map((chunkId) => statement.bind(userId, chunkId)));
  }
}

export function createVectorStore(env: Env): VectorStore {
  if (env.VECTOR_STORE === "local") return new D1VectorStore(env.DB);
  if (!env.VECTORIZE) throw new Error("VECTORIZE binding is missing");
  return new VectorizeStore(env.VECTORIZE);
}
