import { createMiddleware } from "hono/factory";
import { getUserId } from "../lib/access-jwt";
import type { AppEnv } from "../types";

/** Rejects requests without a verified user; handlers read the ID from `c.var.userId`. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const userId = await getUserId(c.req.raw, c.env);
  if (!userId) return c.json({ error: "Not authenticated." }, 401);
  c.set("userId", userId);
  await next();
});
