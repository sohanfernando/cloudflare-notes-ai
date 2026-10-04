import { useChat } from '@ai-sdk/react'
import { MAX_QUESTION_CHARS, type ChatDataParts, type Citation } from '@shared/types'
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

function textOf(message: ChatMessage): string {
  return message.parts.flatMap((part) => (part.type === 'text' ? part.text : [])).join('')
}

function citationsOf(message: ChatMessage): Citation[] {
  return message.parts.flatMap((part) => (part.type === 'data-citations' ? part.data : []))
}

export function ChatPanel({ noteCount }: { noteCount: number }) {
  const [input, setInput] = useState('')
  const { messages, sendMessage, setMessages, regenerate, clearError, stop, status, error } =
    useChat<ChatMessage>({ transport })

  const busy = status === 'submitted' || status === 'streaming'
  const lastMessage = messages.at(-1)
  // Retrieval runs before the first token, so show progress until answer text arrives.
  const waiting = busy && (lastMessage?.role !== 'assistant' || !textOf(lastMessage))

  const handleSubmit = ({ text }: { text: string }) => {
    const question = text.trim()
    if (!question || busy) return
    clearError()
    setInput('')
    void sendMessage({ text: question })
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
                noteCount === 0
                  ? 'Add a note first, then ask a question about it.'
                  : 'Answers come only from your own notes, with the sources shown under each one.'
              }
              icon={<MessageSquareIcon className="size-8" />}
              title="Ask your notes"
            />
          ) : (
            messages.map((message) => <ChatMessageView key={message.id} message={message} />)
          )}
          {waiting && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Spinner /> Searching your notes…
            </div>
          )}
          {error && (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
              role="alert"
            >
              <span>{parseErrorMessage(error.message)}</span>
              <Button onClick={() => void regenerate()} size="sm" variant="outline">
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
              placeholder="Ask a question about your notes…"
              value={input}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <span className="px-2 text-muted-foreground text-xs">
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
