import { createMiddleware } from "hono/factory";
import type { AppEnv, Env } from "../types";

type LimiterName = "AI_RATE_LIMITER" | "INGEST_RATE_LIMITER";

/**
 * Builds a middleware that limits how often one user can call a route that
 * spends Workers AI quota. Must run after `requireUser`: the limit is per user ID.
 */
function limitWith(limiter: LimiterName) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const env: Env = c.env;
    const { success } = await env[limiter].limit({ key: c.var.userId });
    if (!success) {
      return c.json({ error: "Too many requests. Please wait a minute and try again." }, 429);
    }
    await next();
  });
}

/** For asking questions. */
export const limitAiUsage = limitWith("AI_RATE_LIMITER");
/** For creating notes and uploading their parts. */
export const limitIngestion = limitWith("INGEST_RATE_LIMITER");
