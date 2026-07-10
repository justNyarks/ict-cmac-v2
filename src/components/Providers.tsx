'use client'

import { SessionProvider } from "next-auth/react"
import ReverificationPromptProvider from "./ReverificationPromptProvider"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <ReverificationPromptProvider />
    </SessionProvider>
  )
}
