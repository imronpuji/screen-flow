import { apiRequest } from './client';
import type { Notification } from './types';

export function getNotifications() {
  return apiRequest<Notification[]>('/api/notifications');
}
