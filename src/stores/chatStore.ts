import { create } from 'zustand'
import type { Message, StreamState } from '../types'

interface ChatState {
  messagesBySession: Record<string, Message[]>
  streamBySession: Record<string, StreamState>
  streamingText: Record<string, string>

  setMessages: (sessionId: string, messages: Message[]) => void
  addMessage: (sessionId: string, message: Message) => void
  appendToStream: (sessionId: string, chunk: string) => void
  commitStream: (sessionId: string, message: Message) => void
  setStreaming: (sessionId: string, isStreaming: boolean) => void
  setAbortController: (sessionId: string, ctrl: AbortController | null) => void
  clearStream: (sessionId: string) => void
}

export const useChatStore = create<ChatState>()((set) => ({
  messagesBySession: {},
  streamBySession: {},
  streamingText: {},

  setMessages: (sessionId, messages) =>
    set((s) => ({
      messagesBySession: { ...s.messagesBySession, [sessionId]: messages }
    })),

  addMessage: (sessionId, message) =>
    set((s) => ({
      messagesBySession: {
        ...s.messagesBySession,
        [sessionId]: [...(s.messagesBySession[sessionId] ?? []), message]
      }
    })),

  appendToStream: (sessionId, chunk) =>
    set((s) => ({
      streamingText: {
        ...s.streamingText,
        [sessionId]: (s.streamingText[sessionId] ?? '') + chunk
      }
    })),

  commitStream: (sessionId, message) =>
    set((s) => ({
      messagesBySession: {
        ...s.messagesBySession,
        [sessionId]: [...(s.messagesBySession[sessionId] ?? []), message]
      },
      streamingText: { ...s.streamingText, [sessionId]: '' }
    })),

  setStreaming: (sessionId, isStreaming) =>
    set((s) => ({
      streamBySession: {
        ...s.streamBySession,
        [sessionId]: { ...(s.streamBySession[sessionId] ?? { abortController: null }), isStreaming }
      }
    })),

  setAbortController: (sessionId, ctrl) =>
    set((s) => ({
      streamBySession: {
        ...s.streamBySession,
        [sessionId]: { ...(s.streamBySession[sessionId] ?? { isStreaming: false }), abortController: ctrl }
      }
    })),

  clearStream: (sessionId) =>
    set((s) => ({
      streamingText: { ...s.streamingText, [sessionId]: '' },
      streamBySession: {
        ...s.streamBySession,
        [sessionId]: { abortController: null, isStreaming: false }
      }
    }))
}))
