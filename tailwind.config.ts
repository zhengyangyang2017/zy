import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        base: 'var(--color-bg-base)',
        surface: 'var(--color-bg-surface)',
        elevated: 'var(--color-bg-elevated)',
        hover: 'var(--color-bg-hover)',
        active: 'var(--color-bg-active)',
        primary: 'var(--color-primary)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)'
      },
      borderRadius: { DEFAULT: '10px' },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    }
  },
  plugins: []
} satisfies Config
