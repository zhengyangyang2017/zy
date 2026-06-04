import { useToastStore } from '../../stores/toastStore'

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-10 right-4 z-[200] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-2 rounded-lg shadow-lg text-xs animate-fadeIn flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-green-900/90 text-green-300 border border-green-700' :
            toast.type === 'error' ? 'bg-red-900/90 text-red-300 border border-red-700' :
            'bg-surface text-text-secondary border border-hover'
          }`}
        >
          <span>{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className="text-text-muted hover:text-text-primary ml-2">✕</button>
        </div>
      ))}
    </div>
  )
}
