/**
 * Accessibility utilities — WCAG 2.1 AA helpers.
 *
 * Provides ARIA attributes, keyboard navigation patterns,
 * focus management, and screen reader announcements.
 */

/** ARIA attributes for interactive buttons. */
export function buttonAria(label: string, opts?: {
  expanded?: boolean
  pressed?: boolean
  disabled?: boolean
  describedBy?: string
}): Record<string, string | boolean | undefined> {
  return {
    'aria-label': label,
    'aria-expanded': opts?.expanded,
    'aria-pressed': opts?.pressed,
    'aria-disabled': opts?.disabled || undefined,
    'aria-describedby': opts?.describedBy,
    'role': 'button',
    'tabIndex': opts?.disabled ? -1 : 0,
  }
}

/** ARIA attributes for form inputs. */
export function inputAria(label: string, opts?: {
  required?: boolean
  invalid?: boolean
  describedBy?: string
}): Record<string, string> {
  return {
    'aria-label': label,
    'aria-required': opts?.required ? 'true' : 'false',
    'aria-invalid': opts?.invalid ? 'true' : 'false',
    'aria-describedby': opts?.describedBy || '',
  }
}

/** ARIA live region for dynamic content announcements. */
export function liveRegionAria(politeness: 'polite' | 'assertive' = 'polite'): Record<string, string> {
  return {
    'aria-live': politeness,
    'aria-atomic': 'true',
    'role': 'status',
  }
}

/** Keyboard navigation: handle Enter/Space on interactive elements. */
export function handleKeyboardActivation(
  e: React.KeyboardEvent,
  action: () => void
): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    action()
  }
}

/** Generate a unique ID for aria-labelledby/describedby relationships. */
let idCounter = 0
export function a11yId(prefix: string): string {
  return `${prefix}_${++idCounter}`
}
