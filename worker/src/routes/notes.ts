import { Hono } from "hono";
import { limitAiUsage } from "../middleware/rate-limit";
import { createNote, deleteNote, listNotes } from "../services/notes";
import type { AppEnv } from "../types";
import { parseNoteInput } from "../validation/notes";

/** Mounted at /api/notes. */
export const notesRoutes = new Hono<AppEnv>();

notesRoutes.get("/", async (c) => c.json({ notes: await listNotes(c.env, c.var.userId) }));

notesRoutes.post("/", limitAiUsage, async (c) => {
  const input = parseNoteInput(await c.req.json().catch(() => null));
  if (!input.ok) return c.json({ error: input.error }, 400);
  return c.json({ note: await createNote(c.env, c.var.userId, input.value) }, 201);
});

notesRoutes.delete("/:id", async (c) => {
  const deleted = await deleteNote(c.env, c.var.userId, c.req.param("id"));
  if (!deleted) return c.json({ error: "Note not found." }, 404);
  return c.body(null, 204);
});
