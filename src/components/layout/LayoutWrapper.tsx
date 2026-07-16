'use client'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = pathname.startsWith('/auth')

  if (isAuthPage) {
    return <main className="app-paper-surface min-h-screen bg-slate-50">{children}</main>
  }

  return (
    <div className="app-paper-surface flex h-screen overflow-hidden bg-slate-50 print:block print:h-auto print:overflow-visible">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden print:block print:overflow-visible">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6 print:p-0 print:overflow-visible">
          {children}
        </main>
      </div>
    </div>
  )
}
