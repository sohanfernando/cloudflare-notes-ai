import type { NoteSummary } from '@shared/types'
import { useCallback, useEffect, useState } from 'react'
import * as api from '@/lib/api'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

/** Loads the signed-in user's notes and keeps the list in sync after adds and deletes. */
export function useNotes() {
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .fetchNotes()
      .then(setNotes)
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setLoading(false))
  }, [])

  const add = useCallback(async (input: { title: string; content: string }) => {
    const note = await api.createNote(input)
    setNotes((current) => [note, ...current])
  }, [])

  const remove = useCallback(async (id: string) => {
    setError(null)
    try {
      await api.deleteNote(id)
      setNotes((current) => current.filter((note) => note.id !== id))
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [])

  return { notes, loading, error, add, remove }
}
