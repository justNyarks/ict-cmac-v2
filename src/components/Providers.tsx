'use client'

import { SessionProvider } from "next-auth/react"
import ReverificationPromptProvider from "./ReverificationPromptProvider"
import { ThemeProvider } from "./theme/ThemeProvider"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        {children}
        <ReverificationPromptProvider />
      </ThemeProvider>
    </SessionProvider>
  )
}
