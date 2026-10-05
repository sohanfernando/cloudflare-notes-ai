import { Hono } from "hono";
import { limitIngestion } from "../middleware/rate-limit";
import { appendToNote, createNote, deleteNote, listNotes } from "../services/notes";
import type { AppEnv } from "../types";
import { parseNoteInput, parseNotePart } from "../validation/notes";

/** Mounted at /api/notes. */
export const notesRoutes = new Hono<AppEnv>();

notesRoutes.get("/", async (c) => c.json({ notes: await listNotes(c.env, c.var.userId) }));

notesRoutes.post("/", limitIngestion, async (c) => {
  const input = parseNoteInput(await c.req.json().catch(() => null));
  if (!input.ok) return c.json({ error: input.error }, 400);
  return c.json({ note: await createNote(c.env, c.var.userId, input.value) }, 201);
});

// A note larger than one request is created from its first part, then extended here.
notesRoutes.post("/:id/parts", limitIngestion, async (c) => {
  const part = parseNotePart(await c.req.json().catch(() => null));
  if (!part.ok) return c.json({ error: part.error }, 400);
  const note = await appendToNote(c.env, c.var.userId, c.req.param("id"), part.value);
  if (!note) return c.json({ error: "Note not found." }, 404);
  return c.json({ note });
});

notesRoutes.delete("/:id", async (c) => {
  const deleted = await deleteNote(c.env, c.var.userId, c.req.param("id"));
  if (!deleted) return c.json({ error: "Note not found." }, 404);
  return c.body(null, 204);
});
