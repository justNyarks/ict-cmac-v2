export const NOTIFICATIONS_READ_EVENT = 'ict-cmac:notifications-read'

export type NotificationsReadDetail = {
  ids: string[]
}

export function announceNotificationsRead(ids: string[]) {
  if (typeof window === 'undefined' || !ids.length) {
    return
  }

  window.dispatchEvent(new CustomEvent<NotificationsReadDetail>(NOTIFICATIONS_READ_EVENT, {
    detail: { ids },
  }))
}
