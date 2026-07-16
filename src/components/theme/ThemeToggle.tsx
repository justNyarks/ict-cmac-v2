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
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-white text-slate-500 shadow-sm transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 dark:border-[#527a82] dark:bg-[#24394e] dark:text-[#96d8d4] dark:hover:bg-[#365964]"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
