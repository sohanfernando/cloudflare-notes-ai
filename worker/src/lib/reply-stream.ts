import type { InferUIMessageChunk } from "ai";
import type { ChatMessage } from "../types";
import type { AnswerStreamFilter } from "./quotes";

export type ChatChunk = InferUIMessageChunk<ChatMessage>;

export interface ReplyHooks {
  /** The text to show when the model wrote nothing ahead of its quotes section. */
  answerFor(reply: string): string;
  /** Extra chunks, such as sources and quotes, to send once the model's whole reply is known. */
  describe(reply: string): Promise<ChatChunk[]>;
}

/**
 * Turns the model's raw output stream into what the browser should receive.
 *
 * - The quotes section is removed from the text as it streams (`filter`).
 * - Once the reply is known, the chunks from `hooks.describe` are added.
 * - This happens however the model's stream ends. Models stop abruptly when
 *   they hit an output limit or the provider fails mid-reply; if the answer is
 *   already on screen by then, the reader keeps it, with its sources, instead
 *   of getting an error for a part of the reply they were never going to see.
 */
export function shapeReply(
  stream: ReadableStream<ChatChunk>,
  filter: AnswerStreamFilter,
  hooks: ReplyHooks,
): ReadableStream<ChatChunk> {
  /** ID of the text block that is open, if one is. */
  let openTextId: string | null = null;
  let described = false;
  let finished = false;

  const closeText = (controller: TransformStreamDefaultController<ChatChunk>) => {
    if (openTextId === null) return;
    const id = openTextId;
    openTextId = null;

    const held = filter.end();
    if (held) controller.enqueue({ type: "text-delta", id, delta: held });
    if (!filter.hasShownText) {
      controller.enqueue({ type: "text-delta", id, delta: hooks.answerFor(filter.reply) });
    }
    controller.enqueue({ type: "text-end", id });
  };

  const describe = async (controller: TransformStreamDefaultController<ChatChunk>) => {
    if (described) return;
    described = true;
    for (const chunk of await hooks.describe(filter.reply)) controller.enqueue(chunk);
  };

  return stream.pipeThrough(
    new TransformStream<ChatChunk, ChatChunk>({
      async transform(chunk, controller) {
        switch (chunk.type) {
          case "text-start":
            openTextId = chunk.id;
            controller.enqueue(chunk);
            break;
          case "text-delta": {
            const visible = filter.push(chunk.delta);
            if (visible) controller.enqueue({ ...chunk, delta: visible });
            break;
          }
          case "text-end":
            closeText(controller);
            break;
          case "error":
            // With nothing shown yet, the failure is the whole story: pass it on.
            if (!filter.hasShownText) {
              controller.enqueue(chunk);
              break;
            }
            closeText(controller);
            await describe(controller);
            break;
          case "finish":
            closeText(controller);
            await describe(controller);
            finished = true;
            controller.enqueue(chunk);
            break;
          default:
            controller.enqueue(chunk);
        }
      },
      async flush(controller) {
        // Reached without a "finish" when the model's stream simply stopped.
        if (finished || !filter.hasShownText) return;
        closeText(controller);
        await describe(controller);
        controller.enqueue({ type: "finish" });
      },
    }),
  );
}
