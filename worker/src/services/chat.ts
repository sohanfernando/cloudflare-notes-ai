import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type InferUIMessageChunk,
  type ToolSet,
} from "ai";
import type { Citation } from "../../../shared/types";
import { chatModel, embedTexts } from "../lib/ai";
import { AnswerStreamFilter, checkQuotes, resolveReply } from "../lib/quotes";
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
const EMPTY_REPLY_ANSWER =
  "I couldn't put together an answer from your notes. Please try asking again.";
const NOTHING_IN_NOTE_ANSWER =
  "I couldn't find anything in the selected note. If you just added it, wait a few seconds and ask again.";

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

function buildInstructions(chunks: RetrievedChunk[]): string {
  const context = chunks
    .map((chunk, index) => `[${index + 1}] From the note "${chunk.noteTitle}":\n${chunk.content}`)
    .join("\n\n");
  return `You are a helpful assistant. Answer ONLY using the context below.
If the answer is not in the context, say "I don't know."

Write your answer first. Then, on a new line, write QUOTES: and under it list one to three short passages from the context that support your answer, one per line, like this:
[1] "a passage copied from source 1"
Copy each passage word for word from the context. Do not reword, correct or shorten it. If you answered "I don't know", do not write a QUOTES section.

Context:
${context}`;
}

type ChatChunk = InferUIMessageChunk<ChatMessage>;

/**
 * Removes the model's QUOTES section from the answer as it streams. The
 * section is read from the complete reply instead, checked, and sent to the
 * browser as data, so the reader never sees the model's raw version of it.
 * If the model wrote no answer before its quotes, one is supplied at the end.
 */
function hideQuotesSection(
  stream: ReadableStream<ChatChunk>,
  chunks: RetrievedChunk[],
): ReadableStream<ChatChunk> {
  const filter = new AnswerStreamFilter();
  return stream.pipeThrough(
    new TransformStream<ChatChunk, ChatChunk>({
      transform(chunk, controller) {
        if (chunk.type === "text-delta") {
          const visible = filter.push(chunk.delta);
          if (visible) controller.enqueue({ ...chunk, delta: visible });
        } else if (chunk.type === "text-end") {
          const held = filter.end();
          if (held) controller.enqueue({ type: "text-delta", id: chunk.id, delta: held });
          if (!filter.hasShownText) {
            const { answer } = resolveReply(filter.reply, chunks);
            controller.enqueue({ type: "text-delta", id: chunk.id, delta: answer || EMPTY_REPLY_ANSWER });
          }
          controller.enqueue(chunk);
        } else {
          controller.enqueue(chunk);
        }
      },
    }),
  );
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
  const { embedding, chunks } = await retrieve(env, userId, request.question, request.noteId);

  const stream = createUIMessageStream<ChatMessage>({
    execute: ({ writer }) => {
      writer.write({ type: "start" });

      if (chunks.length === 0) {
        // Nothing to ground an answer in, so reply directly instead of spending an LLM call.
        const id = crypto.randomUUID();
        writer.write({ type: "text-start", id });
        const delta = request.noteId ? NOTHING_IN_NOTE_ANSWER : NO_NOTES_ANSWER;
        writer.write({ type: "text-delta", id, delta });
        writer.write({ type: "text-end", id });
        writer.write({ type: "finish" });
        return;
      }

      const result = streamText({
        model: chatModel(env),
        instructions: buildInstructions(chunks),
        messages: [...request.history, { role: "user", content: request.question }],
        // Sources and quotes are worked out once the reply is complete, since they depend on it.
        onEnd: async ({ text }) => {
          const { answer, quotesBlock } = resolveReply(text, chunks);
          // A reply with nothing usable in it is neither an answer nor a gap in the notes.
          if (!answer) return;
          const answered = !UNKNOWN_ANSWER.test(answer);

          const citations = selectCitations(env, chunks, answer);
          if (citations.length > 0) writer.write({ type: "data-citations", data: citations });

          if (answered) {
            const cited = chunks.filter((chunk) =>
              citations.some((citation) => citation.chunkId === chunk.chunkId),
            );
            const quotes = checkQuotes(answer, quotesBlock, chunks, cited);
            if (quotes.length > 0) writer.write({ type: "data-quotes", data: quotes });
          }

          const tracking = trackGap(env, userId, {
            question: request.question,
            embedding,
            bestScore: chunks[0]?.score ?? 0,
            noteId: request.noteId,
            answered,
          });
          runInBackground(tracking);
          // Awaited so the browser's reload of the gaps list, on finish, sees the change.
          await tracking;
        },
      });
      writer.merge(
        hideQuotesSection(
          toUIMessageStream<ToolSet, ChatMessage>({ stream: result.stream, sendStart: false }),
          chunks,
        ),
      );
    },
    onError: (error) => {
      console.error("chat stream failed", error);
      return "The language model failed to respond. Please try again in a moment.";
    },
  });

  return createUIMessageStreamResponse({ stream });
}
