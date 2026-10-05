const encoder = new TextEncoder();

function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/**
 * Splits text into consecutive parts of at most `maxBytes` UTF-8 bytes each,
 * breaking at a line break or space where one is reasonably close, so a large
 * note can be uploaded over several requests. Whitespace-only parts are dropped.
 */
export function splitIntoParts(text: string, maxBytes: number): string[] {
  const parts: string[] = [];
  let rest = text;

  while (byteLength(rest) > maxBytes) {
    // A character is at least one byte, so this many characters is an upper bound.
    let end = Math.min(rest.length, maxBytes);
    while (byteLength(rest.slice(0, end)) > maxBytes) end = Math.floor(end * 0.9);

    const breakAt = Math.max(rest.lastIndexOf("\n", end), rest.lastIndexOf(" ", end));
    if (breakAt > end / 2) {
      end = breakAt;
    } else if (isHighSurrogate(rest.charCodeAt(end - 1))) {
      // No usable break: at least don't cut a two-unit character in half.
      end--;
    }

    parts.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  parts.push(rest);

  return parts.filter((part) => part.trim());
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
