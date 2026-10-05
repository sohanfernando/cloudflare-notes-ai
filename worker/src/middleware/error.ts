import type { ErrorHandler, NotFoundHandler } from "hono";
import { AiServiceError } from "../lib/ai";
import { NoteTooLargeError } from "../services/notes";
import type { AppEnv } from "../types";

export const handleNotFound: NotFoundHandler<AppEnv> = (c) => c.json({ error: "Not found." }, 404);

/** Logs the error and replies with a message that is safe to show to the user. */
export const handleError: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof NoteTooLargeError) return c.json({ error: error.message }, 413);

  console.error(error);
  if (error instanceof AiServiceError) {
    return c.json({ error: "The AI service is unavailable or rate limited. Try again shortly." }, 502);
  }
  return c.json({ error: "Something went wrong." }, 500);
};
