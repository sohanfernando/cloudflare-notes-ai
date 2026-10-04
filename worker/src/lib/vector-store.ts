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
  query(userId: string, values: number[], topK: number): Promise<VectorMatch[]>;
  deleteByChunkIds(userId: string, chunkIds: string[]): Promise<void>;
}

/**
 * Production store. The index needs a metadata index on `user_id`, created
 * before any vectors are inserted, for the query filter to apply.
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

  async query(userId: string, values: number[], topK: number): Promise<VectorMatch[]> {
    const { matches } = await this.index.query(values, {
      topK,
      filter: { user_id: userId },
      returnMetadata: "none",
    });
    return matches.map((match) => ({ chunkId: match.id, score: match.score }));
  }

  // Vectorize deletes by ID only; callers pass IDs already read from D1 with a user_id filter.
  async deleteByChunkIds(_userId: string, chunkIds: string[]): Promise<void> {
    if (chunkIds.length > 0) await this.index.deleteByIds(chunkIds);
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

  async query(userId: string, values: number[], topK: number): Promise<VectorMatch[]> {
    const { results } = await this.db
      .prepare("SELECT chunk_id, embedding FROM local_vectors WHERE user_id = ?")
      .bind(userId)
      .all<{ chunk_id: string; embedding: string }>();

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
