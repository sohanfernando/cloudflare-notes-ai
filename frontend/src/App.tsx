import { MoonIcon, NotebookTextIcon, SunIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ChatPanel, type ChatHandle } from '@/components/chat-panel'
import { NotesPanel } from '@/components/notes-panel'
import { Button } from '@/components/ui/button'
import { useGaps } from '@/hooks/use-gaps'
import { useNotes, type UploadProgress } from '@/hooks/use-notes'
import { useTheme } from '@/hooks/use-theme'
import { fetchCurrentUser } from '@/lib/api'
import { cn } from '@/lib/utils'

type Tab = 'chat' | 'notes'

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'notes', label: 'Notes' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('chat')
  const [userId, setUserId] = useState<string | null>(null)
  const { theme, toggle } = useTheme()
  const notes = useNotes()
  const gaps = useGaps()
  const chat = useRef<ChatHandle>(null)

  const addNote = async (input: { title: string; content: string }, onProgress?: UploadProgress) => {
    await notes.add(input, onProgress)
    // A new note may be suggested as the answer to an open gap.
    gaps.refresh()
  }

  const askGap = (question: string, noteId: string | null) => {
    setTab('chat')
    chat.current?.ask(question, noteId)
  }

  useEffect(() => {
    // The header simply omits the email if this fails; the panels report their own errors.
    fetchCurrentUser().then(setUserId, () => undefined)
  }, [])

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="flex items-center gap-2 font-semibold">
          <NotebookTextIcon className="size-5" /> Notes AI
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {userId && <span className="truncate text-muted-foreground text-sm">{userId}</span>}
          <Button
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={toggle}
            size="icon-sm"
            variant="ghost"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </Button>
        </div>
      </header>

      {/* On phones the two panels are tabs; from the md breakpoint they sit side by side. */}
      <nav className="grid grid-cols-2 border-b md:hidden">
        {TABS.map(({ id, label }) => (
          <button
            aria-current={tab === id ? 'page' : undefined}
            className={cn(
              'border-b-2 py-2 font-medium text-sm',
              tab === id ? 'border-primary' : 'border-transparent text-muted-foreground',
            )}
            key={id}
            onClick={() => setTab(id)}
            type="button"
          >
            {label}
            {id === 'notes' && notes.notes.length > 0 && ` (${notes.notes.length})`}
          </button>
        ))}
      </nav>

      {/* Both panels stay mounted so switching tabs keeps the conversation and any draft. */}
      <main className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'min-h-0 w-full flex-col md:flex md:w-96 md:shrink-0 md:border-r',
            tab === 'notes' ? 'flex' : 'hidden',
          )}
        >
          <NotesPanel
            error={notes.error}
            loading={notes.loading}
            notes={notes.notes}
            onAdd={addNote}
            onDelete={notes.remove}
            gaps={gaps.gaps}
            onAskGap={askGap}
            onDismissGap={gaps.dismiss}
          />
        </aside>
        <section
          className={cn('min-h-0 min-w-0 flex-1 flex-col md:flex', tab === 'chat' ? 'flex' : 'hidden')}
        >
          <ChatPanel notes={notes.notes} onAnswered={gaps.refresh} ref={chat} />
        </section>
      </main>
    </div>
  )
}
