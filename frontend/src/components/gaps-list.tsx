import type { Gap, NoteSummary } from '@shared/types'
import { RotateCcwIcon, SparklesIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'

interface GapsListProps {
  gaps: Gap[]
  notes: NoteSummary[]
  /** Asks the question again, limited to `noteId` when one is given. */
  onAsk: (question: string, noteId: string | null) => void
  onDismiss: (id: string) => void
}

/** Questions the user's notes could not answer, so they can see what is worth adding. */
export function GapsList({ gaps, notes, onAsk, onDismiss }: GapsListProps) {
  if (gaps.length === 0) return null

  return (
    <section aria-labelledby="gaps-heading" className="mt-6">
      <h2
        className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide"
        id="gaps-heading"
      >
        Gaps ({gaps.length})
      </h2>
      <p className="mb-3 text-muted-foreground text-xs">
        Questions your notes couldn't answer. A gap closes when you ask it again and get an answer.
      </p>
      <ul className="flex flex-col gap-2">
        {gaps.map((gap) => (
          <GapItem gap={gap} key={gap.id} notes={notes} onAsk={onAsk} onDismiss={onDismiss} />
        ))}
      </ul>
    </section>
  )
}

function GapItem({ gap, notes, onAsk, onDismiss }: { gap: Gap } & Omit<GapsListProps, 'gaps'>) {
  // Either note may have been deleted since, in which case it is simply not mentioned.
  const askedIn = notes.find((note) => note.id === gap.noteId)
  const suggested = notes.find((note) => note.id === gap.suggestedNoteId)

  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 break-words text-sm">{gap.question}</p>
        <Button
          aria-label={`Dismiss gap: ${gap.question}`}
          className="-mt-1 -mr-1"
          onClick={() => onDismiss(gap.id)}
          size="icon-sm"
          variant="ghost"
        >
          <XIcon />
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Asked {gap.askCount === 1 ? 'once' : `${gap.askCount} times`} · {formatDate(gap.lastAskedAt)}
        {askedIn && ` · in ${askedIn.title}`}
      </p>
      {suggested && (
        <p className="mt-2 flex items-start gap-1.5 text-xs">
          <SparklesIcon className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">
            <span className="font-medium">{suggested.title}</span> may answer this now.
          </span>
        </p>
      )}
      <Button
        className="mt-2"
        onClick={() => onAsk(gap.question, suggested?.id ?? askedIn?.id ?? null)}
        size="sm"
        variant={suggested ? 'default' : 'outline'}
      >
        <RotateCcwIcon /> Ask again
      </Button>
    </li>
  )
}
