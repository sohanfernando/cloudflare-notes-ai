import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

/**
 * Limits how often one user can hit the routes that spend Workers AI quota.
 * Must run after `requireUser`, since the limit is counted per user ID.
 */
export const limitAiUsage = createMiddleware<AppEnv>(async (c, next) => {
  const { success } = await c.env.AI_RATE_LIMITER.limit({ key: c.var.userId });
  if (!success) {
    return c.json({ error: "Too many requests. Please wait a minute and try again." }, 429);
  }
  await next();
});
