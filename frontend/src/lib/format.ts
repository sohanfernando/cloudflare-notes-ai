const KB = 1024
const MB = 1024 * KB

export function formatBytes(bytes: number): string {
  if (bytes < KB) return `${bytes} B`
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`
  return `${(bytes / MB).toFixed(1)} MB`
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function formatDate(timestamp: number): string {
  return dateFormatter.format(timestamp)
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}
