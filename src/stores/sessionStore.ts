import { create } from 'zustand'
import type { Session } from '../types'

interface SessionState {
  sessions: Session[]
  activeSessionId: string | null
  setSessions: (sessions: Session[]) => void
  setActiveSession: (id: string) => void
  addSession: (session: Session) => void
  removeSession: (id: string) => void
  updateSession: (id: string, updates: Partial<Session>) => void
}

export const useSessionStore = create<SessionState>()((set) => ({
  sessions: [],
  activeSessionId: null,

  setSessions: (sessions) => set({ sessions }),

  setActiveSession: (id) => set({ activeSessionId: id }),

  addSession: (session) =>
    set((s) => ({
      sessions: [session, ...s.sessions],
      activeSessionId: session.id
    })),

  removeSession: (id) =>
    set((s) => {
      const sessions = s.sessions.filter((sess) => sess.id !== id)
      return {
        sessions,
        activeSessionId: s.activeSessionId === id
          ? (sessions[0]?.id ?? null)
          : s.activeSessionId
      }
    }),

  updateSession: (id, updates) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, ...updates } : sess
      )
    }))
}))
