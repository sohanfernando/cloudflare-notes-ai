import type { ModelMessage } from "ai";
import { z } from "zod";
import { MAX_QUESTION_CHARS } from "../../../shared/types";
import type { Parsed } from "../types";

/** Earlier turns sent to the model, so follow-up questions keep their context. */
const HISTORY_MESSAGES = 10;
const MAX_HISTORY_MESSAGE_CHARS = 4000;
/** Note IDs are UUIDs (36 characters); this only bounds what is passed on to the stores. */
const MAX_NOTE_ID_CHARS = 64;

// Only user and assistant roles are accepted: the system prompt is set by the server alone.
const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        parts: z.array(z.looseObject({ type: z.string(), text: z.string().optional() })),
      }),
    )
    .min(1),
  noteId: z.string().min(1).max(MAX_NOTE_ID_CHARS).optional(),
});

export interface ChatRequest {
  question: string;
  history: ModelMessage[];
  /** When set, only this note is searched; otherwise all of the user's notes are. */
  noteId?: string;
}

/** Validates a `useChat` request body and reduces it to the question plus recent text history. */
export function parseChatRequest(body: unknown): Parsed<ChatRequest> {
  const result = chatRequestSchema.safeParse(body);
  if (!result.success) {
    return { ok: false, error: "Expected a non-empty list of chat messages and an optional note ID." };
  }

  const turns = result.data.messages
    .map((message) => ({
      role: message.role,
      content: message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join("")
        .trim(),
    }))
    .filter((turn) => turn.content);

  const last = turns.pop();
  if (!last || last.role !== "user") return { ok: false, error: "The last message must be a question." };
  if (last.content.length > MAX_QUESTION_CHARS) {
    return { ok: false, error: `Questions are limited to ${MAX_QUESTION_CHARS} characters.` };
  }

  const history = turns.slice(-HISTORY_MESSAGES).map((turn) => ({
    role: turn.role,
    content: turn.content.slice(0, MAX_HISTORY_MESSAGE_CHARS),
  }));
  return { ok: true, value: { question: last.content, history, noteId: result.data.noteId } };
}
