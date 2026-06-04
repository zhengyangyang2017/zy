import { create } from 'zustand'

interface ToastState {
  toasts: Array<{ id: string; message: string; type: string }>
  addToast: (message: string, type?: string) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>()(() => ({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
}))
