import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0a0a14',
        primary: '#6366f1',
        accent: '#8b5cf6',
      }
    }
  },
  plugins: [],
}
export default config
