import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requireUser } from "./middleware/auth";
import { handleError, handleNotFound } from "./middleware/error";
import { chatRoutes } from "./routes/chat";
import { notesRoutes } from "./routes/notes";
import type { AppEnv } from "./types";

/** Cap on any request body; leaves room for JSON escaping around a 100 KB note. */
const MAX_BODY_BYTES = 256 * 1024;

const app = new Hono<AppEnv>().basePath("/api");

app.use(
  cors({
    origin: (origin, c) => (origin === c.env.ALLOWED_ORIGIN ? origin : null),
    allowMethods: ["GET", "POST", "DELETE"],
  }),
);
app.use(
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: "Request body is too large." }, 413),
  }),
);
// Every route below runs as a verified user.
app.use(requireUser);

app.get("/me", (c) => c.json({ userId: c.var.userId }));
app.route("/notes", notesRoutes);
app.route("/chat", chatRoutes);

app.notFound(handleNotFound);
app.onError(handleError);

export default app;
