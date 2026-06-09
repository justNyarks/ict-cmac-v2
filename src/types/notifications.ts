import type { RequestStatus } from "@prisma/client"

export interface AppNotification {
  id: string
  requestId: string
  eventTitle: string
  status: RequestStatus
  title: string
  description: string
  tone: "success" | "warning" | "danger" | "info"
  createdAt: string
}
