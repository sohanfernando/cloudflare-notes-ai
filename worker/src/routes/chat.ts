import { Hono } from "hono";
import { answerQuestion } from "../services/chat";
import type { AppEnv } from "../types";
import { parseChatRequest } from "../validation/chat";

/** Mounted at /api/chat. */
export const chatRoutes = new Hono<AppEnv>();

chatRoutes.post("/", async (c) => {
  const request = parseChatRequest(await c.req.json().catch(() => null));
  if (!request.ok) return c.json({ error: request.error }, 400);
  return answerQuestion(c.env, c.var.userId, request.value);
});
