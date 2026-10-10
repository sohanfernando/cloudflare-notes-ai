import type { CurrentUser } from '@shared/types'
import { LogOutIcon, MenuIcon, MoonIcon, NotebookTextIcon, SunIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ChatPanel, type ChatHandle } from '@/components/chat-panel'
import { NotesPanel } from '@/components/notes-panel'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useGaps } from '@/hooks/use-gaps'
import { useNotes, type UploadProgress } from '@/hooks/use-notes'
import { useTheme } from '@/hooks/use-theme'
import { fetchCurrentUser } from '@/lib/api'
import { cn } from '@/lib/utils'

type Tab = 'chat' | 'notes'

/** Cloudflare Access serves this path on every protected site; visiting it ends the session. */
const SIGN_OUT_URL = '/cdn-cgi/access/logout'

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'notes', label: 'Notes' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('chat')
  const [user, setUser] = useState<CurrentUser | null>(null)
  const { theme, toggle } = useTheme()
  const notes = useNotes()
  const gaps = useGaps()
  const chat = useRef<ChatHandle>(null)
  const themeLabel = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`

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
    fetchCurrentUser().then(setUser, () => undefined)
  }, [])

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap font-semibold">
          <NotebookTextIcon className="size-5" /> Notes AI
        </div>
        {/* From the sm breakpoint the account controls sit in the header; on phones they are in a menu. */}
        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          {user && <span className="truncate text-muted-foreground text-sm">{user.userId}</span>}
          <Button aria-label={themeLabel} onClick={toggle} size="icon-sm" variant="ghost">
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </Button>
          {user?.canSignOut && (
            <Button asChild size="sm" variant="outline">
              <a href={SIGN_OUT_URL}>
                <LogOutIcon /> Sign out
              </a>
            </Button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Menu" className="sm:hidden" size="icon-sm" variant="ghost">
              <MenuIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-48 max-w-[calc(100vw-2rem)]">
            {user && (
              <>
                <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                  {user.userId}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={toggle}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />} {themeLabel}
            </DropdownMenuItem>
            {user?.canSignOut && (
              <DropdownMenuItem asChild>
                <a href={SIGN_OUT_URL}>
                  <LogOutIcon /> Sign out
                </a>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
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
