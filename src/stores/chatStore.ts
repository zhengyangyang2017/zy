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
  clearStream: (sessionId: string) => void

  // NEW methods
  editMessage: (sessionId: string, messageId: string, newContent: string) => void
  removeLastAssistantMessage: (sessionId: string) => void
  truncateAfterMessage: (sessionId: string, messageId: string) => Message[]
  setMessageFeedback: (sessionId: string, messageId: string, feedback: 'up' | 'down') => void
}

export const useChatStore = create<ChatState>()((set, get) => ({
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

  clearStream: (sessionId) =>
    set((s) => ({
      streamingText: { ...s.streamingText, [sessionId]: '' },
      streamBySession: {
        ...s.streamBySession,
        [sessionId]: { abortController: null, isStreaming: false }
      }
    })),

  // NEW methods
  editMessage: (sessionId, messageId, newContent) =>
    set((s) => {
      const msgs = s.messagesBySession[sessionId] ?? []
      const idx = msgs.findIndex(m => m.id === messageId)
      if (idx === -1) return s
      const updated = [...msgs]
      updated[idx] = { ...updated[idx], content: newContent }
      return {
        messagesBySession: { ...s.messagesBySession, [sessionId]: updated }
      }
    }),

  removeLastAssistantMessage: (sessionId) =>
    set((s) => {
      const msgs = s.messagesBySession[sessionId] ?? []
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          return {
            messagesBySession: {
              ...s.messagesBySession,
              [sessionId]: [...msgs.slice(0, i), ...msgs.slice(i + 1)]
            }
          }
        }
      }
      return s
    }),

  truncateAfterMessage: (sessionId, messageId) => {
    const msgs = get().messagesBySession[sessionId] ?? []
    const idx = msgs.findIndex(m => m.id === messageId)
    if (idx === -1) return msgs
    const truncated = msgs.slice(0, idx + 1)
    set((s) => ({
      messagesBySession: { ...s.messagesBySession, [sessionId]: truncated }
    }))
    return truncated
  },

  setMessageFeedback: (sessionId, messageId, feedback) =>
    set((s) => {
      const msgs = s.messagesBySession[sessionId] ?? []
      const idx = msgs.findIndex(m => m.id === messageId)
      if (idx === -1) return s
      const updated = [...msgs]
      updated[idx] = { ...updated[idx], feedback }
      return {
        messagesBySession: { ...s.messagesBySession, [sessionId]: updated }
      }
    }),
}))
