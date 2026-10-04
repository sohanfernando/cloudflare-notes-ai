import type { NoteSummary } from '@shared/types'

const FALLBACK_ERROR = 'Something went wrong. Please try again.'

/** Extracts the `error` field the Worker sends with every failed response. */
export function parseErrorMessage(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body)
    if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string') {
      return parsed.error
    }
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return FALLBACK_ERROR
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, init)
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.')
  }
  if (!response.ok) throw new Error(parseErrorMessage(await response.text()))
  return (response.status === 204 ? undefined : await response.json()) as T
}

export async function fetchCurrentUser(): Promise<string> {
  const { userId } = await request<{ userId: string }>('/me')
  return userId
}

export async function fetchNotes(): Promise<NoteSummary[]> {
  const { notes } = await request<{ notes: NoteSummary[] }>('/notes')
  return notes
}

export async function createNote(input: { title: string; content: string }): Promise<NoteSummary> {
  const { note } = await request<{ note: NoteSummary }>('/notes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return note
}

export async function deleteNote(id: string): Promise<void> {
  await request<void>(`/notes/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
