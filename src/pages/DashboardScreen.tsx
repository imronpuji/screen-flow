import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActiveLoan } from '../api/loans';
import { getNotifications } from '../api/notifications';
import { ApiClientError } from '../api/client';
import type { Loan, Notification } from '../api/types';
import { Layout } from '../components/Layout';
import { SkeletonCard } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAnnounce } from '../hooks/useAnnounce';

const KYC_BADGE: Record<string, string> = {
  verified: 'badge-success',
  pending: 'badge-warning',
  rejected: 'badge-danger',
  not_submitted: 'badge-muted',
};

export function DashboardScreen() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const [activeLoan, setActiveLoan] = useState<Loan | null | undefined>(undefined);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  useAnnounce(announcement);

  useEffect(() => {
    const load = async () => {
      try {
        const [loan, notifs] = await Promise.all([
          getActiveLoan().catch(() => null),
          getNotifications().catch(() => []),
        ]);
        setActiveLoan(loan);
        setNotifications(notifs);
        setAnnouncement('Dashboard loaded');
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 401) {
          logout();
        } else {
          showToast('Failed to load dashboard');
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [logout, showToast]);

  const kycStatus = user?.kyc_status ?? 'not_submitted';
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Layout
      title="Beranda"
      showBottomNav
      rightAction={
        <button
          type="button"
          className="icon-btn"
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
          onClick={() => navigate('/notifications')}
        >
          🔔{unreadCount > 0 && <span className="badge-count">{unreadCount}</span>}
        </button>
      }
    >
      {loading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : (
        <>
          <section className="greeting-card card">
            <h2>Halo, {user?.full_name?.split(' ')[0] ?? 'kamu'}!</h2>
            <div className="row-between">
              <span>Status KYC</span>
              <span className={`badge ${KYC_BADGE[kycStatus] ?? 'badge-muted'}`}>
                {kycStatus.replace('_', ' ')}
              </span>
            </div>
            <button type="button" className="link-btn" onClick={() => navigate('/profile')}>
              Lihat Profil →
            </button>
          </section>

          <button type="button" className="cta-card card cta-card-prominent" onClick={() => navigate('/loan/apply')}>
            <span className="cta-emoji" aria-hidden="true">💰</span>
            <div>
              <span className="cta-title">Ajukan Pinjaman</span>
              <span className="text-muted">Tap di sini atau menu Ajukan di bawah</span>
            </div>
            <span className="cta-arrow" aria-hidden="true">→</span>
          </button>

          {activeLoan ? (
            <button
              type="button"
              className="card loan-card"
              onClick={() => navigate('/loan/active')}
            >
              <h3>Pinjaman Aktif</h3>
              <p className="amount">
                Rp {activeLoan.remaining_balance?.toLocaleString('id-ID') ?? activeLoan.amount.toLocaleString('id-ID')}
              </p>
              <span className="text-muted">Sisa saldo</span>
            </button>
          ) : (
            <div className="card empty-state">
              <p>Belum ada pinjaman aktif</p>
              <span className="text-muted">Ajukan pinjaman lewat menu <strong>Ajukan</strong> di bawah</span>
            </div>
          )}

          {notifications.length > 0 && (
            <section className="card">
              <h3>Recent Notifications</h3>
              {notifications.slice(0, 3).map((n) => (
                <div key={n.id} className="notif-item">
                  <strong>{n.title}</strong>
                  <p className="text-muted">{n.message}</p>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </Layout>
  );
}
