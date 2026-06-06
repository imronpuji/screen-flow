import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getLoan } from '../api/loans';
import { ApiClientError } from '../api/client';
import type { Loan } from '../api/types';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useToast } from '../context/ToastContext';
import { useAnnounce } from '../hooks/useAnnounce';

const STEPS = ['under_review', 'approved', 'rejected'] as const;

export function ApplicationStatusScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loan, setLoan] = useState<Loan | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  useAnnounce(announcement);

  const fetchLoan = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getLoan(id);
      setLoan(data);
      setNotFound(false);
      setAnnouncement(`Application status: ${data.status.replace('_', ' ')}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        setNotFound(true);
      } else {
        showToast('Failed to load application status');
      }
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    fetchLoan();
  }, [fetchLoan]);

  const currentStep = loan ? STEPS.indexOf(loan.status as (typeof STEPS)[number]) : -1;

  return (
    <Layout title="Application Status" showBack>
      {loading ? (
        <div className="center-block">
          <Spinner label="Loading status" />
        </div>
      ) : notFound ? (
        <div className="empty-state card">
          <p>Application not found</p>
          <Button variant="secondary" onClick={() => navigate('/dashboard')}>
            Go to Dashboard
          </Button>
        </div>
      ) : loan ? (
        <>
          <div className="timeline">
            {STEPS.map((step, i) => (
              <div
                key={step}
                className={`timeline-step ${i <= currentStep ? 'active' : ''} ${loan.status === step ? 'current' : ''}`}
              >
                <div className="timeline-dot" />
                <span>{step.replace('_', ' ')}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="summary-row">
              <span>Amount</span>
              <strong>Rp {loan.amount.toLocaleString('id-ID')}</strong>
            </div>
            <div className="summary-row">
              <span>Submitted</span>
              <strong>{new Date(loan.created_at).toLocaleDateString('id-ID')}</strong>
            </div>
          </div>

          {loan.status === 'approved' && loan.disbursed_at && (
            <div className="card alert-success">
              <p>Your loan has been disbursed!</p>
              <Button onClick={() => navigate('/loan/active')}>View Active Loan</Button>
            </div>
          )}

          <div className="btn-row">
            <Button variant="secondary" onClick={fetchLoan}>
              Refresh
            </Button>
            <Button variant="ghost" onClick={() => navigate('/dashboard')}>
              Dashboard
            </Button>
          </div>
        </>
      ) : null}
    </Layout>
  );
}
