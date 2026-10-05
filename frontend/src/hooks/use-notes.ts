import { splitIntoParts } from '@shared/split'
import { UPLOAD_PART_BYTES, type NoteSummary } from '@shared/types'
import { useCallback, useEffect, useState } from 'react'
import * as api from '@/lib/api'

/** Called after each part of a note is stored, with how many are done out of the total. */
export type UploadProgress = (done: number, total: number) => void

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

  /**
   * Adds a note. Text too large for one request is sent as a series of parts:
   * the first creates the note and the rest are appended to it in order.
   */
  const add = useCallback(
    async (input: { title: string; content: string }, onProgress?: UploadProgress) => {
      const [first, ...rest] = splitIntoParts(input.content, UPLOAD_PART_BYTES)
      if (first === undefined) throw new Error('The note is empty.')
      const total = rest.length + 1

      let note = await api.createNote({ title: input.title, content: first })
      onProgress?.(1, total)
      try {
        for (const [index, part] of rest.entries()) {
          note = await api.appendToNote(note.id, part)
          onProgress?.(index + 2, total)
        }
      } catch (cause) {
        // Don't leave half a document behind. If this fails too, the partial
        // note stays visible after a reload and can be deleted by hand.
        await api.deleteNote(note.id).catch(() => undefined)
        throw cause
      }
      setNotes((current) => [note, ...current])
    },
    [],
  )

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
