export interface AppNotification {
  id: string
  title: string
  description: string
  tone: "success" | "warning" | "danger" | "info"
  priority: 'critical' | 'high' | 'medium' | 'low'
  createdAt: string
  href: string
  module: 'CORE' | 'PMAC'
  isRead: boolean
  dueLabel?: string | null
}
