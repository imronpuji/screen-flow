import { useCallback, useEffect, useState } from 'react';
import { getInstallments } from '../api/installments';
import type { Installment } from '../api/types';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { useToast } from '../context/ToastContext';
import { useAnnounce } from '../hooks/useAnnounce';

export function PaymentHistoryScreen() {
  const { showToast } = useToast();
  const [paid, setPaid] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(true);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  useAnnounce(announcement);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInstallments();
      const filtered = data.filter((i) => i.status === 'paid');
      setPaid(filtered);
      setAnnouncement('Payment history loaded');
    } catch {
      showToast('Failed to load payment history');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const total = paid.reduce((sum, i) => sum + i.amount, 0);

  return (
    <Layout title="Payment History" showBack>
      <div className="card total-card">
        <span>Total Paid</span>
        <strong className="amount">Rp {total.toLocaleString('id-ID')}</strong>
      </div>

      <Button variant="secondary" className="btn-block" onClick={fetchData}>
        Refresh
      </Button>

      {loading ? (
        <div className="shimmer-list">
          {[1, 2, 3].map((i) => (
            <div key={i} className="shimmer-item" />
          ))}
        </div>
      ) : paid.length === 0 ? (
        <div className="empty-state card">
          <p>No payment history yet</p>
        </div>
      ) : (
        <ul className="installment-list">
          {paid.map((item) => (
            <li key={item.id} className="card installment-item">
              <div className="row-between">
                <div>
                  <strong>Rp {item.amount.toLocaleString('id-ID')}</strong>
                  <p className="text-muted">
                    Paid on {new Date(item.due_date).toLocaleDateString('id-ID')}
                  </p>
                </div>
                <span className="badge badge-success">paid</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
