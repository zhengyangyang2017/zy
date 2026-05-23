/**
 * Reusable loading spinner with optional label.
 */

interface Props {
  label?: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASSES = {
  sm: 'w-3 h-3 border',
  md: 'w-5 h-5 border-2',
  lg: 'w-8 h-8 border-2',
}

export function Spinner({ label, size = 'md' }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div
        className={`${SIZE_CLASSES[size]} rounded-full border-text-muted/30 border-t-primary animate-spin`}
      />
      {label && (
        <span className="text-xs text-text-muted">{label}</span>
      )}
    </div>
  )
}

/** Inline spinner for use inside text or buttons. */
export function InlineSpinner() {
  return (
    <span className="inline-block w-3 h-3 rounded-full border border-text-muted/30 border-t-primary animate-spin align-middle" />
  )
}
