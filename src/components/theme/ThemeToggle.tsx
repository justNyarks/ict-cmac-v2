'use client'

import { Moon, Sun } from 'lucide-react'

import { useTheme } from './ThemeProvider'

export default function ThemeToggle() {
  const { mounted, theme, toggleTheme } = useTheme()
  const isDark = mounted && theme === 'dark'
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-white text-slate-500 shadow-sm transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 dark:border-white/[0.08] dark:bg-[#1e2a3d] dark:text-[#2dd4bf] dark:hover:bg-[#26364d]"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
