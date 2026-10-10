import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { embedMany } from "ai";
import type { Env } from "../types";

/** Size of the production Vectorize index, and of the default embedding models' vectors. */
const DEFAULT_EMBEDDING_DIMENSIONS = 768;

/** The LLM or embedding endpoint failed or was rate limited. */
export class AiServiceError extends Error {
  constructor(cause: unknown) {
    super("AI service request failed", { cause });
    this.name = "AiServiceError";
  }
}

/**
 * Ollama and Workers AI both expose an OpenAI-compatible API, so the same
 * provider serves local development and production; only env values differ.
 */
function createProvider(env: Env) {
  return createOpenAICompatible({
    name: "llm",
    baseURL: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY,
  });
}

export function chatModel(env: Env) {
  return createProvider(env).chatModel(env.LLM_MODEL);
}

/** Embeds each text, returning vectors in the same order. */
export async function embedTexts(env: Env, texts: string[]): Promise<number[][]> {
  let embeddings: number[][];
  try {
    ({ embeddings } = await embedMany({
      model: createProvider(env).embeddingModel(env.EMBEDDING_MODEL),
      values: texts,
    }));
  } catch (error) {
    throw new AiServiceError(error);
  }

  const dimensions = Number(env.EMBEDDING_DIMENSIONS) || DEFAULT_EMBEDDING_DIMENSIONS;
  for (const embedding of embeddings) {
    if (embedding.length !== dimensions) {
      throw new Error(
        `${env.EMBEDDING_MODEL} returned ${embedding.length} dimensions, expected ${dimensions}`,
      );
    }
  }
  return embeddings;
}
