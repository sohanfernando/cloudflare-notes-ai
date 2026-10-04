import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { embedMany } from "ai";
import type { Env } from "../types";

/** Must match the Vectorize index; both configured embedding models produce this. */
export const EMBEDDING_DIMENSIONS = 768;

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

  for (const embedding of embeddings) {
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `${env.EMBEDDING_MODEL} returned ${embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`,
      );
    }
  }
  return embeddings;
}
