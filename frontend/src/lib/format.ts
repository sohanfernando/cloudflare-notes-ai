export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function formatDate(timestamp: number): string {
  return dateFormatter.format(timestamp)
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}
