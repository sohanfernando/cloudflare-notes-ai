import { useChat } from '@ai-sdk/react'
import {
  MAX_QUESTION_CHARS,
  type ChatDataParts,
  type Citation,
  type NoteSummary,
} from '@shared/types'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { BookOpenIcon, ChevronDownIcon, MessageSquareIcon, RotateCcwIcon, SquarePenIcon } from 'lucide-react'
import { useState } from 'react'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'
import { Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { parseErrorMessage } from '@/lib/api'

type ChatMessage = UIMessage<never, ChatDataParts>

const transport = new DefaultChatTransport<ChatMessage>({ api: '/api/chat' })

/** Value of the note picker when questions search every note. */
const ALL_NOTES = 'all'

function textOf(message: ChatMessage): string {
  return message.parts.flatMap((part) => (part.type === 'text' ? part.text : [])).join('')
}

function citationsOf(message: ChatMessage): Citation[] {
  return message.parts.flatMap((part) => (part.type === 'data-citations' ? part.data : []))
}

export function ChatPanel({ notes }: { notes: NoteSummary[] }) {
  const [input, setInput] = useState('')
  const [selectedNoteId, setSelectedNoteId] = useState(ALL_NOTES)
  const { messages, sendMessage, setMessages, regenerate, clearError, stop, status, error } =
    useChat<ChatMessage>({ transport })

  // Looked up on every render, so the picker falls back to "All notes" if the note is deleted.
  const scope = notes.find((note) => note.id === selectedNoteId)
  const requestOptions = scope ? { body: { noteId: scope.id } } : undefined

  const busy = status === 'submitted' || status === 'streaming'
  const lastMessage = messages.at(-1)
  // Retrieval runs before the first token, so show progress until answer text arrives.
  const waiting = busy && (lastMessage?.role !== 'assistant' || !textOf(lastMessage))

  const handleSubmit = ({ text }: { text: string }) => {
    const question = text.trim()
    if (!question || busy) return
    clearError()
    setInput('')
    void sendMessage({ text: question }, requestOptions)
  }

  const startNewChat = () => {
    void stop()
    clearError()
    setMessages([])
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="font-medium text-sm">Chat</h2>
        <Button disabled={messages.length === 0} onClick={startNewChat} size="sm" variant="ghost">
          <SquarePenIcon /> New chat
        </Button>
      </div>

      <Conversation>
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 ? (
            <ConversationEmptyState
              description={
                notes.length === 0
                  ? 'Add a note first, then ask a question about it.'
                  : 'Answers come only from your own notes, with the sources shown under each one. Pick a note below to ask about just that one.'
              }
              icon={<MessageSquareIcon className="size-8" />}
              title="Ask your notes"
            />
          ) : (
            messages.map((message) => <ChatMessageView key={message.id} message={message} />)
          )}
          {waiting && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Spinner /> {scope ? `Searching ${scope.title}…` : 'Searching your notes…'}
            </div>
          )}
          {error && (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
              role="alert"
            >
              <span>{parseErrorMessage(error.message)}</span>
              <Button onClick={() => void regenerate(requestOptions)} size="sm" variant="outline">
                <RotateCcwIcon /> Try again
              </Button>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-3xl p-4 pt-0">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              maxLength={MAX_QUESTION_CHARS}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                scope ? `Ask about ${scope.title}…` : 'Ask a question about your notes…'
              }
              value={input}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools className="min-w-0">
              {notes.length > 0 && (
                <PromptInputSelect onValueChange={setSelectedNoteId} value={scope?.id ?? ALL_NOTES}>
                  <PromptInputSelectTrigger aria-label="Note to ask about" className="max-w-56 min-w-0">
                    <BookOpenIcon />
                    <PromptInputSelectValue />
                  </PromptInputSelectTrigger>
                  <PromptInputSelectContent align="start" className="max-w-80" position="popper" side="top">
                    <PromptInputSelectItem value={ALL_NOTES}>All notes</PromptInputSelectItem>
                    {notes.map((note) => (
                      <PromptInputSelectItem key={note.id} value={note.id}>
                        {note.title}
                      </PromptInputSelectItem>
                    ))}
                  </PromptInputSelectContent>
                </PromptInputSelect>
              )}
              <span className="shrink-0 px-2 text-muted-foreground text-xs">
                {input.length}/{MAX_QUESTION_CHARS}
              </span>
            </PromptInputTools>
            <PromptInputSubmit disabled={!busy && !input.trim()} onStop={stop} status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

function ChatMessageView({ message }: { message: ChatMessage }) {
  const text = textOf(message)
  const citations = citationsOf(message)
  if (!text) return null

  return (
    <Message from={message.role}>
      <MessageContent>
        {message.role === 'user' ? (
          <p className="whitespace-pre-wrap break-words">{text}</p>
        ) : (
          <MessageResponse>{text}</MessageResponse>
        )}
      </MessageContent>
      {citations.length > 0 && <CitationList citations={citations} />}
    </Message>
  )
}

function CitationList({ citations }: { citations: Citation[] }) {
  return (
    <Sources defaultOpen>
      <SourcesTrigger count={citations.length}>
        <p className="font-medium">
          {citations.length === 1 ? 'Used 1 source' : `Used ${citations.length} sources`}
        </p>
        <ChevronDownIcon className="size-4" />
      </SourcesTrigger>
      <SourcesContent className="w-full">
        {citations.map((citation) => (
          <div className="flex gap-2 rounded-lg border p-2 text-foreground" key={citation.chunkId}>
            <BookOpenIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="font-medium">
                {citation.noteTitle}
                <span className="font-normal text-muted-foreground">
                  {' '}
                  · chunk {Number(citation.chunkId.split(':').at(-1)) + 1} ·{' '}
                  {Math.round(citation.score * 100)}% match
                </span>
              </p>
              <p className="line-clamp-2 text-muted-foreground">{citation.snippet}</p>
            </div>
          </div>
        ))}
      </SourcesContent>
    </Sources>
  )
}
