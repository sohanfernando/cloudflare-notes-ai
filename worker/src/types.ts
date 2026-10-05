import type { UIMessage } from "ai";
import type { ChatDataParts } from "../../shared/types";

/** Bindings and variables available to the Worker (see wrangler.toml and .dev.vars). */
export interface Env {
  DB: D1Database;
  /** Only bound in production; local development uses the D1-backed store. */
  VECTORIZE?: Vectorize;
  /** Per-user limiter for asking questions. */
  AI_RATE_LIMITER: RateLimit;
  /** Per-user limiter for adding note text; higher, since a large note arrives in many parts. */
  INGEST_RATE_LIMITER: RateLimit;

  LLM_BASE_URL: string;
  LLM_API_KEY: string;
  LLM_MODEL: string;
  EMBEDDING_MODEL: string;
  /**
   * Lowest similarity score (0 to 1) a chunk needs to be shown as a source.
   * Set per environment because each embedding model scores on its own scale.
   */
  CITATION_MIN_SCORE?: string;

  /** Auth is enforced unless this is exactly "false". */
  AUTH_ENABLED: string;
  /** e.g. https://your-team.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag of the Access application. */
  ACCESS_AUD?: string;

  ALLOWED_ORIGIN: string;
  VECTOR_STORE: "local" | "vectorize";
}

export type AppEnv = { Bindings: Env; Variables: { userId: string } };

/** Result of validating untrusted input. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export type ChatMessage = UIMessage<never, ChatDataParts>;
