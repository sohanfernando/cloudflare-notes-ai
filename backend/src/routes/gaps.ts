import { Hono } from "hono";
import { dismissGap, listGaps } from "../services/gaps";
import type { AppEnv } from "../types";

/** Mounted at /api/gaps. */
export const gapsRoutes = new Hono<AppEnv>();

gapsRoutes.get("/", async (c) => c.json({ gaps: await listGaps(c.env, c.var.userId) }));

gapsRoutes.delete("/:id", async (c) => {
  const dismissed = await dismissGap(c.env, c.var.userId, c.req.param("id"));
  if (!dismissed) return c.json({ error: "Gap not found." }, 404);
  return c.body(null, 204);
});
