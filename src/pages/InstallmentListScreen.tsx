import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInstallments } from '../api/installments';
import type { Installment } from '../api/types';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { useToast } from '../context/ToastContext';
import { useAnnounce } from '../hooks/useAnnounce';

const STATUS_CLASS: Record<string, string> = {
  unpaid: 'badge-warning',
  paid: 'badge-success',
  overdue: 'badge-danger',
};

export function InstallmentListScreen() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'paid'>('all');
  const [announcement, setAnnouncement] = useState<string | null>(null);
  useAnnounce(announcement);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInstallments();
      setInstallments(data);
      setAnnouncement('Installments loaded');
    } catch {
      showToast('Failed to load installments');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered =
    filter === 'paid' ? installments.filter((i) => i.status === 'paid') : installments;

  return (
    <Layout
      title="Installments"
      showBack
      rightAction={
        <button type="button" className="link-btn" onClick={() => navigate('/payments/history')}>
          History
        </button>
      }
    >
      <div className="filter-tabs">
        <button
          type="button"
          className={filter === 'all' ? 'tab active' : 'tab'}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          type="button"
          className={filter === 'paid' ? 'tab active' : 'tab'}
          onClick={() => setFilter('paid')}
        >
          Paid
        </button>
      </div>

      {loading ? (
        <div className="shimmer-list">
          {[1, 2, 3].map((i) => (
            <div key={i} className="shimmer-item" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card">
          <p>No installments found</p>
        </div>
      ) : (
        <ul className="installment-list">
          {filtered.map((item) => (
            <li key={item.id} className="card installment-item">
              <div className="row-between">
                <div>
                  <strong>Rp {item.amount.toLocaleString('id-ID')}</strong>
                  <p className="text-muted">
                    Due {new Date(item.due_date).toLocaleDateString('id-ID')}
                  </p>
                </div>
                <span className={`badge ${STATUS_CLASS[item.status]}`}>{item.status}</span>
              </div>
              {(item.status === 'unpaid' || item.status === 'overdue') && (
                <Button
                  className="btn-sm"
                  onClick={() => navigate(`/payment/${item.id}`, { state: { installment: item } })}
                >
                  Pay
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
