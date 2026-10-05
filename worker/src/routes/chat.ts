import { Hono } from "hono";
import { limitAiUsage } from "../middleware/rate-limit";
import { answerQuestion } from "../services/chat";
import type { AppEnv } from "../types";
import { parseChatRequest } from "../validation/chat";

/** Mounted at /api/chat. */
export const chatRoutes = new Hono<AppEnv>();

chatRoutes.post("/", limitAiUsage, async (c) => {
  const request = parseChatRequest(await c.req.json().catch(() => null));
  if (!request.ok) return c.json({ error: request.error }, 400);
  // Work that finishes after the answer has streamed (recording gaps) must outlive the response.
  return answerQuestion(c.env, c.var.userId, request.value, (work) => c.executionCtx.waitUntil(work));
});
