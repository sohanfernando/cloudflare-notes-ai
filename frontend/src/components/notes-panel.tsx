import { MAX_NOTE_BYTES, MAX_TITLE_CHARS, type Gap, type NoteSummary } from '@shared/types'
import { FileTextIcon, PaperclipIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { GapsList } from '@/components/gaps-list'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import type { UploadProgress } from '@/hooks/use-notes'
import { ACCEPTED_FILE_TYPES, extractText } from '@/lib/extract'
import { byteLength, formatBytes, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/** How long the "note added" hint stays visible. */
const INDEXING_HINT_MS = 15_000

interface NotesPanelProps {
  notes: NoteSummary[]
  loading: boolean
  error: string | null
  onAdd: (input: { title: string; content: string }, onProgress?: UploadProgress) => Promise<void>
  onDelete: (id: string) => Promise<void>
  gaps: Gap[]
  onAskGap: (question: string, noteId: string | null) => void
  onDismissGap: (id: string) => void
}

export function NotesPanel({
  notes,
  loading,
  error,
  onAdd,
  onDelete,
  gaps,
  onAskGap,
  onDismissGap,
}: NotesPanelProps) {
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
            No notes yet. Paste some text or upload a document above and it becomes searchable in the
            chat.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notes.map((note) => (
              <NoteItem key={note.id} note={note} onDelete={onDelete} />
            ))}
          </ul>
        )}
        <GapsList gaps={gaps} notes={notes} onAsk={onAskGap} onDismiss={onDismissGap} />
      </div>
    </div>
  )
}

/** Text read from an uploaded file, shown as a chip in place of the text box. */
interface Attachment {
  name: string
  text: string
}

function AddNoteForm({ onAdd }: Pick<NotesPanelProps, 'onAdd'>) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [justAdded, setJustAdded] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const text = attachment?.text ?? content
  const size = byteLength(text)
  const tooLarge = size > MAX_NOTE_BYTES
  const busy = reading || saving

  // The vector index takes a while to pick up a new note, so say so for a while.
  useEffect(() => {
    if (!justAdded) return
    const timer = setTimeout(() => setJustAdded(false), INDEXING_HINT_MS)
    return () => clearTimeout(timer)
  }, [justAdded])

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset so choosing the same file again still fires a change event.
    event.target.value = ''
    if (!file) return

    setError(null)
    setJustAdded(false)
    setReading(true)
    try {
      setAttachment({ name: file.name, text: await extractText(file) })
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, '').slice(0, MAX_TITLE_CHARS))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read this file.')
    } finally {
      setReading(false)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setJustAdded(false)
    try {
      await onAdd({ title, content: text }, (done, total) => setProgress({ done, total }))
      setTitle('')
      setContent('')
      setAttachment(null)
      setJustAdded(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the note.')
    } finally {
      setSaving(false)
      setProgress(null)
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
      {attachment ? (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm">{attachment.name}</span>
          <Button
            aria-label={`Remove ${attachment.name}`}
            disabled={busy}
            onClick={() => setAttachment(null)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        <Textarea
          aria-label="Note content"
          className="max-h-60 min-h-28 resize-y"
          onChange={(event) => setContent(event.target.value)}
          placeholder="Paste text, or upload a PDF, Word or text file…"
          value={content}
        />
      )}
      <input
        accept={ACCEPTED_FILE_TYPES}
        aria-label="Upload a document"
        className="hidden"
        onChange={handleFile}
        ref={fileInput}
        type="file"
      />
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-xs', tooLarge ? 'text-destructive' : 'text-muted-foreground')}>
          {formatBytes(size)} / {formatBytes(MAX_NOTE_BYTES)}
        </span>
        <div className="flex items-center gap-2">
          <Button
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            type="button"
            variant="outline"
          >
            {reading ? <Spinner /> : <PaperclipIcon />}
            {reading ? 'Reading…' : 'Upload'}
          </Button>
          <Button disabled={busy || tooLarge || !text.trim()} type="submit">
            {saving ? <Spinner /> : <PlusIcon />}
            {saving ? indexingLabel(progress) : 'Add note'}
          </Button>
        </div>
      </div>
      {tooLarge && (
        <p className="text-destructive text-sm">
          This is {formatBytes(size)} of text. A note can hold up to {formatBytes(MAX_NOTE_BYTES)}.
        </p>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {justAdded && (
        <p className="text-muted-foreground text-xs" role="status">
          Note added. It can take up to a minute to become searchable; a question asked sooner
          waits for it.
        </p>
      )}
    </form>
  )
}

/** Button label while saving; large notes go up in parts, so show how far along it is. */
function indexingLabel(progress: { done: number; total: number } | null): string {
  if (!progress || progress.total === 1) return 'Indexing…'
  return `Indexing ${Math.round((progress.done / progress.total) * 100)}%`
}

function NoteItem({ note, onDelete }: { note: NoteSummary } & Pick<NotesPanelProps, 'onDelete'>) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (event: MouseEvent) => {
    // Keep the dialog open, showing progress, until the note is actually gone.
    event.preventDefault()
    setDeleting(true)
    await onDelete(note.id)
    setDeleting(false)
    setConfirming(false)
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
      <AlertDialog onOpenChange={(open) => !deleting && setConfirming(open)} open={confirming}>
        <AlertDialogTrigger asChild>
          <Button aria-label={`Delete ${note.title}`} size="icon-sm" variant="ghost">
            <Trash2Icon />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="break-words font-medium text-foreground">{note.title}</span> will be
              permanently deleted, and answers will no longer use it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={handleDelete} variant="destructive">
              {deleting ? <Spinner /> : <Trash2Icon />}
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}
