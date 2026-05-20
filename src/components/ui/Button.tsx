import type { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
}

export function Button({ variant = 'primary', className = '', children, ...props }: Props) {
  const base = 'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 active:scale-[0.97] disabled:opacity-40'
  const variants = {
    primary: 'bg-primary text-white hover:opacity-90',
    secondary: 'bg-transparent border border-hover text-text-secondary hover:bg-hover'
  }
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}
