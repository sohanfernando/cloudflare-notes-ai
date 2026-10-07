import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type ToolSet,
  type UIMessageStreamWriter,
} from "ai";
import type { Citation } from "../../../shared/types";
import { chatModel, embedTexts } from "../lib/ai";
import { buildInstructions } from "../lib/prompt";
import { AnswerStreamFilter, checkQuotes, resolveReply } from "../lib/quotes";
import { shapeReply, type ChatChunk } from "../lib/reply-stream";
import { retryUntilFound } from "../lib/retry";
import { createVectorStore } from "../lib/vector-store";
import type { ChatMessage, Env } from "../types";
import type { ChatRequest } from "../validation/chat";
import { trackGap } from "./gaps";

const TOP_K = 5;
const SNIPPET_CHARS = 200;
/**
 * All retrieved chunks go to the model as context, but only those scoring
 * within this fraction of the best match are shown as sources. A ratio is used
 * because absolute similarity scores differ between embedding models.
 */
const CITATION_SCORE_RATIO = 0.9;
/** The prompt tells the model to reply this way when the context has no answer. */
const UNKNOWN_ANSWER = /^\W*i (don['’]t|do not) know/i;

const NO_NOTES_ANSWER =
  "I couldn't find anything in your notes to answer from. Add a note first, then ask again.";
/**
 * Ceiling on the model's reply. Workers AI stops at 256 tokens unless told
 * otherwise, which cut replies with long quotes off part-way through.
 */
const MAX_REPLY_TOKENS = 700;

const MODEL_FAILED_ANSWER = "The language model failed to respond. Please try again in a moment.";
const EMPTY_REPLY_ANSWER =
  "I couldn't put together an answer from your notes. Please try asking again.";
const NOTHING_IN_NOTE_ANSWER = "I couldn't find anything in the selected note.";

// Vectorize makes new vectors searchable some time after they are stored. A
// question asked inside that window finds nothing, so it is retried for a while.
const INDEXING_RETRY_MS = 3000;
const INDEXING_MAX_WAIT_MS = 45_000;
const INDEXING_NOTE_STATUS = "This note is still being indexed. Waiting for it to become searchable…";
const INDEXING_NOTES_STATUS = "Your notes are still being indexed. Waiting for them to become searchable…";
const STILL_INDEXING_ANSWER =
  "Your notes are taking longer than usual to become searchable. Please ask again in a minute.";

interface RetrievedChunk extends Citation {
  content: string;
}

interface Retrieval {
  /** The question's embedding. */
  embedding: number[];
  /** The user's chunks most similar to the question, best match first. */
  chunks: RetrievedChunk[];
}

async function retrieve(
  env: Env,
  userId: string,
  question: string,
  noteId?: string,
): Promise<Retrieval> {
  const [embedding] = await embedTexts(env, [question]);
  if (!embedding) throw new Error("The question was not embedded");
  return { embedding, chunks: await findChunks(env, userId, embedding, noteId) };
}

async function findChunks(
  env: Env,
  userId: string,
  embedding: number[],
  noteId?: string,
): Promise<RetrievedChunk[]> {
  const matches = await createVectorStore(env).query(userId, embedding, TOP_K, noteId);
  if (matches.length === 0) return [];

  // The vector store only returns IDs; the text is read from D1, again scoped to the user.
  const placeholders = matches.map(() => "?").join(", ");
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.note_id, c.content, n.title
     FROM chunks c
     JOIN notes n ON n.id = c.note_id AND n.user_id = c.user_id
     WHERE c.user_id = ? AND c.id IN (${placeholders})`,
  )
    .bind(userId, ...matches.map((match) => match.chunkId))
    .all<{ id: string; note_id: string; content: string; title: string }>();

  const rowsById = new Map(results.map((row) => [row.id, row]));
  return matches.flatMap((match) => {
    const row = rowsById.get(match.chunkId);
    if (!row) return [];
    return {
      chunkId: row.id,
      noteId: row.note_id,
      noteTitle: row.title,
      score: match.score,
      snippet: row.content.slice(0, SNIPPET_CHARS),
      content: row.content,
    };
  });
}

/** Picks the chunks worth showing as sources for an answer. */
function selectCitations(env: Env, chunks: RetrievedChunk[], answer: string): Citation[] {
  // An "I don't know" answer was not derived from any note, so it cites none.
  if (UNKNOWN_ANSWER.test(answer)) return [];
  // The floor drops everything when even the best match is weak, e.g. for a greeting.
  const floor = Number(env.CITATION_MIN_SCORE) || 0;
  const minScore = Math.max(floor, (chunks[0]?.score ?? 0) * CITATION_SCORE_RATIO);
  return chunks
    .filter((chunk) => chunk.score >= minScore)
    .map(({ content: _content, ...citation }) => citation);
}

/** True if the user has note text stored, in one note or in any, whether or not it is searchable yet. */
async function hasStoredChunks(env: Env, userId: string, noteId?: string): Promise<boolean> {
  const statement = noteId
    ? env.DB.prepare("SELECT 1 FROM chunks WHERE user_id = ? AND note_id = ? LIMIT 1").bind(userId, noteId)
    : env.DB.prepare("SELECT 1 FROM chunks WHERE user_id = ? LIMIT 1").bind(userId);
  return (await statement.first()) !== null;
}

/** Writes a complete reply that did not come from the model. */
function writeFixedAnswer(writer: UIMessageStreamWriter<ChatMessage>, text: string): void {
  const id = crypto.randomUUID();
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
  writer.write({ type: "finish" });
}

/**
 * Retrieves context for the question and streams a grounded answer with its
 * citations. `runInBackground` receives work that may still be running when
 * the stream ends, so the caller can keep the Worker alive for it.
 */
export async function answerQuestion(
  env: Env,
  userId: string,
  request: ChatRequest,
  runInBackground: (work: Promise<unknown>) => void,
): Promise<Response> {
  const { noteId } = request;
  const retrieval = await retrieve(env, userId, request.question, noteId);
  const { embedding } = retrieval;

  const stream = createUIMessageStream<ChatMessage>({
    execute: async ({ writer }) => {
      writer.write({ type: "start" });

      let chunks = retrieval.chunks;
      if (chunks.length === 0) {
        if (!(await hasStoredChunks(env, userId, noteId))) {
          // Nothing to ground an answer in, so reply directly instead of spending an LLM call.
          writeFixedAnswer(writer, noteId ? NOTHING_IN_NOTE_ANSWER : NO_NOTES_ANSWER);
          return;
        }

        // The text is stored but the vector index has not caught up with it yet,
        // which takes up to a minute after a note is added. Say so, and keep trying.
        writer.write({
          type: "data-status",
          data: { message: noteId ? INDEXING_NOTE_STATUS : INDEXING_NOTES_STATUS },
          transient: true,
        });
        chunks = await retryUntilFound(() => findChunks(env, userId, embedding, noteId), {
          intervalMs: INDEXING_RETRY_MS,
          maxWaitMs: INDEXING_MAX_WAIT_MS,
        });
        if (chunks.length === 0) {
          writeFixedAnswer(writer, STILL_INDEXING_ANSWER);
          return;
        }
      }

      /** Works out what accompanies a finished reply: its sources, its checked quotes, and its gap. */
      const describeReply = async (reply: string): Promise<ChatChunk[]> => {
        const { answer, quotesBlock } = resolveReply(reply, chunks);
        // A reply with nothing usable in it is neither an answer nor a gap in the notes.
        if (!answer) return [];
        const answered = !UNKNOWN_ANSWER.test(answer);
        const described: ChatChunk[] = [];

        const citations = selectCitations(env, chunks, answer);
        if (citations.length > 0) described.push({ type: "data-citations", data: citations });

        if (answered) {
          const cited = chunks.filter((chunk) =>
            citations.some((citation) => citation.chunkId === chunk.chunkId),
          );
          const quotes = checkQuotes(answer, quotesBlock, chunks, cited);
          if (quotes.length > 0) described.push({ type: "data-quotes", data: quotes });
        }

        const tracking = trackGap(env, userId, {
          question: request.question,
          embedding,
          bestScore: chunks[0]?.score ?? 0,
          noteId,
          answered,
        });
        runInBackground(tracking);
        // Awaited so the browser's reload of the gaps list, on finish, sees the change.
        await tracking;
        return described;
      };

      const result = streamText({
        model: chatModel(env),
        instructions: buildInstructions(chunks),
        messages: [...request.history, { role: "user", content: request.question }],
        maxOutputTokens: MAX_REPLY_TOKENS,
      });
      const modelOutput = toUIMessageStream<ToolSet, ChatMessage>({
        stream: result.stream,
        sendStart: false,
        onError: (error) => {
          console.error("model stream failed", error);
          return MODEL_FAILED_ANSWER;
        },
      });

      // Sources and quotes depend on the whole reply, so shapeReply adds them at
      // the end, and does so even when the model's stream stops without finishing.
      writer.merge(
        shapeReply(modelOutput, new AnswerStreamFilter(), {
          answerFor: (reply) => resolveReply(reply, chunks).answer || EMPTY_REPLY_ANSWER,
          describe: describeReply,
        }),
      );
    },
    onError: (error) => {
      console.error("chat stream failed", error);
      return MODEL_FAILED_ANSWER;
    },
  });

  return createUIMessageStreamResponse({ stream });
}
