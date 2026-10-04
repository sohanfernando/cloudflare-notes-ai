import { MAX_NOTE_BYTES, MAX_TITLE_CHARS, type NoteSummary } from '@shared/types'
import { FileTextIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { byteLength, formatBytes, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/** How long the "note added" hint stays visible. */
const INDEXING_HINT_MS = 15_000

interface NotesPanelProps {
  notes: NoteSummary[]
  loading: boolean
  error: string | null
  onAdd: (input: { title: string; content: string }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function NotesPanel({ notes, loading, error, onAdd, onDelete }: NotesPanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AddNoteForm onAdd={onAdd} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <h2 className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Your notes{notes.length > 0 && ` (${notes.length})`}
        </h2>
        {error && <p className="mb-3 text-destructive text-sm">{error}</p>}
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Spinner /> Loading notes…
          </div>
        ) : notes.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No notes yet. Paste some text above and it becomes searchable in the chat.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notes.map((note) => (
              <NoteItem key={note.id} note={note} onDelete={onDelete} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function AddNoteForm({ onAdd }: Pick<NotesPanelProps, 'onAdd'>) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justAdded, setJustAdded] = useState(false)

  const size = byteLength(content)
  const tooLarge = size > MAX_NOTE_BYTES

  // The vector index takes a few seconds to pick up a new note, so say so for a while.
  useEffect(() => {
    if (!justAdded) return
    const timer = setTimeout(() => setJustAdded(false), INDEXING_HINT_MS)
    return () => clearTimeout(timer)
  }, [justAdded])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setJustAdded(false)
    try {
      await onAdd({ title, content })
      setTitle('')
      setContent('')
      setJustAdded(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the note.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="flex flex-col gap-2 border-b p-4" onSubmit={handleSubmit}>
      <Input
        aria-label="Note title"
        maxLength={MAX_TITLE_CHARS}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Title (optional)"
        value={title}
      />
      <Textarea
        aria-label="Note content"
        className="max-h-60 min-h-28 resize-y"
        onChange={(event) => setContent(event.target.value)}
        placeholder="Paste a note, document or any text…"
        value={content}
      />
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-xs', tooLarge ? 'text-destructive' : 'text-muted-foreground')}>
          {formatBytes(size)} / {formatBytes(MAX_NOTE_BYTES)}
        </span>
        <Button disabled={saving || tooLarge || !content.trim()} type="submit">
          {saving ? <Spinner /> : <PlusIcon />}
          {saving ? 'Indexing…' : 'Add note'}
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {justAdded && (
        <p className="text-muted-foreground text-xs" role="status">
          Note added. It can take a few seconds before answers start using it.
        </p>
      )}
    </form>
  )
}

function NoteItem({ note, onDelete }: { note: NoteSummary } & Pick<NotesPanelProps, 'onDelete'>) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${note.title}"? This cannot be undone.`)) return
    setDeleting(true)
    await onDelete(note.id)
    setDeleting(false)
  }

  return (
    <li className="flex items-start gap-3 rounded-lg border p-3">
      <FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{note.title}</p>
        <p className="text-muted-foreground text-xs">
          {formatDate(note.createdAt)} · {formatBytes(note.sizeBytes)} · {note.chunkCount}{' '}
          {note.chunkCount === 1 ? 'chunk' : 'chunks'}
        </p>
      </div>
      <Button
        aria-label={`Delete ${note.title}`}
        disabled={deleting}
        onClick={handleDelete}
        size="icon-sm"
        variant="ghost"
      >
        {deleting ? <Spinner /> : <Trash2Icon />}
      </Button>
    </li>
  )
}
