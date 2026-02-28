import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sidebar: {
          bg: '#0f172a',
          hover: '#1e293b',
          active: '#334155',
          text: '#94a3b8',
          'text-active': '#f1f5f9',
        },
        tier: {
          1: '#f59e0b',
          2: '#3b82f6',
          3: '#6b7280',
        },
        status: {
          active: '#22c55e',
          outreach: '#3b82f6',
          warm: '#f59e0b',
          cold: '#6b7280',
          dormant: '#6b7280',
          target: '#8b5cf6',
          overdue: '#ef4444',
        },
      },
    },
  },
  plugins: [],
}
export default config
