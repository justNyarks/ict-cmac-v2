export interface AppNotification {
  id: string
  title: string
  description: string
  tone: "success" | "warning" | "danger" | "info"
  createdAt: string
  href: string
  module: 'CORE' | 'PMAC'
}
