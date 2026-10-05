import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from "ai";
import type { Citation } from "../../../shared/types";
import { chatModel, embedTexts } from "../lib/ai";
import { createVectorStore } from "../lib/vector-store";
import type { ChatMessage, Env } from "../types";
import type { ChatRequest } from "../validation/chat";

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
const NOTHING_IN_NOTE_ANSWER =
  "I couldn't find anything in the selected note. If you just added it, wait a few seconds and ask again.";

interface RetrievedChunk extends Citation {
  content: string;
}

/** Finds the user's chunks most similar to the question, best match first. */
async function retrieve(
  env: Env,
  userId: string,
  question: string,
  noteId?: string,
): Promise<RetrievedChunk[]> {
  const [embedding] = await embedTexts(env, [question]);
  const matches = await createVectorStore(env).query(userId, embedding!, TOP_K, noteId);
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

Context:
${context}`;
}

/** Retrieves context for the question and streams a grounded answer with its citations. */
export async function answerQuestion(env: Env, userId: string, request: ChatRequest): Promise<Response> {
  const chunks = await retrieve(env, userId, request.question, request.noteId);

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
        // Sources are chosen once the answer is complete, since they depend on what it says.
        onEnd: ({ text }) => {
          const citations = selectCitations(env, chunks, text);
          if (citations.length > 0) writer.write({ type: "data-citations", data: citations });
        },
      });
      writer.merge(toUIMessageStream({ stream: result.stream, sendStart: false }));
    },
    onError: (error) => {
      console.error("chat stream failed", error);
      return "The language model failed to respond. Please try again in a moment.";
    },
  });

  return createUIMessageStreamResponse({ stream });
}
