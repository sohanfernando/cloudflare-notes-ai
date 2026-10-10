export const CHUNK_TOKENS = 250;
export const CHUNK_OVERLAP_TOKENS = 40;

/** Longest run of non-space characters kept as one word; longer runs are split. */
const MAX_WORD_CHARS = 100;

/** Normalizes unicode and collapses excessive whitespace, keeping paragraph breaks. */
export function cleanText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Rough token count for one word. There is no tokenizer in the Worker, so this
 * deliberately overestimates (about 4 characters per token, rounded up): the
 * production embedding model truncates input past 512 tokens, and a chunk that
 * is a little short is better than one whose end is silently dropped.
 */
function estimateTokens(word: string): number {
  return Math.ceil(word.length / 4);
}

function splitWords(text: string): string[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => word.match(new RegExp(`.{1,${MAX_WORD_CHARS}}`, "gu")) ?? []);
}

/**
 * Splits text into chunks of roughly `size` tokens, each starting with about
 * `overlap` tokens repeated from the end of the previous chunk so that a
 * sentence cut at a boundary is still retrievable in full.
 */
export function chunkText(
  text: string,
  size: number = CHUNK_TOKENS,
  overlap: number = CHUNK_OVERLAP_TOKENS,
): string[] {
  const words = splitWords(text);
  const tokens = words.map(estimateTokens);
  const chunks: string[] = [];

  let start = 0;
  while (start < words.length) {
    let end = start;
    let used = 0;
    while (end < words.length && (end === start || used + tokens[end]! <= size)) {
      used += tokens[end]!;
      end++;
    }
    chunks.push(words.slice(start, end).join(" "));
    if (end === words.length) break;

    // Step back from the end of this chunk to find where the next one starts.
    let next = end;
    let overlapped = 0;
    while (next - 1 > start && overlapped + tokens[next - 1]! <= overlap) {
      next--;
      overlapped += tokens[next]!;
    }
    start = next;
  }
  return chunks;
}
