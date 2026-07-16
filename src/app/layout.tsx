import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/Providers'

export const metadata: Metadata = {
  title: 'ICT CMAC System',
  description: 'Documentation Service Request Management System',
}

const themeBootstrapScript = `
  (() => {
    try {
      const storedTheme = localStorage.getItem('ict-cmac-theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', storedTheme ? storedTheme === 'dark' : prefersDark);
    } catch {}
  })();
`

import LayoutWrapper from '@/components/layout/LayoutWrapper'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="bg-slate-50 antialiased font-sans">
        <Providers>
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
        </Providers>
      </body>
    </html>
  )
}
