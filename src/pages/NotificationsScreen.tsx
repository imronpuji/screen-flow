import { useEffect, useState } from 'react';
import { getNotifications } from '../api/notifications';
import type { Notification } from '../api/types';
import { Layout } from '../components/Layout';
import { SkeletonCard } from '../components/Skeleton';
import { useToast } from '../context/ToastContext';

export function NotificationsScreen() {
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNotifications()
      .then(setNotifications)
      .catch(() => showToast('Failed to load notifications'))
      .finally(() => setLoading(false));
  }, [showToast]);

  return (
    <Layout title="Notifications" showBack>
      {loading ? (
        <SkeletonCard />
      ) : notifications.length === 0 ? (
        <div className="empty-state card">
          <p>No notifications</p>
        </div>
      ) : (
        <ul className="notif-list">
          {notifications.map((n) => (
            <li key={n.id} className={`card notif-item ${n.read ? '' : 'unread'}`}>
              <strong>{n.title}</strong>
              <p>{n.message}</p>
              <span className="text-muted">
                {new Date(n.created_at).toLocaleDateString('id-ID')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
