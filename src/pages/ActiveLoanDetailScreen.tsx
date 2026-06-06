import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActiveLoan } from '../api/loans';
import type { Loan } from '../api/types';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { SkeletonCard } from '../components/Skeleton';
import { useToast } from '../context/ToastContext';
import { useAnnounce } from '../hooks/useAnnounce';

export function ActiveLoanDetailScreen() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loan, setLoan] = useState<Loan | null | undefined>(undefined);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  useAnnounce(announcement);

  useEffect(() => {
    getActiveLoan()
      .then((data) => {
        setLoan(data);
        if (data) setAnnouncement('Active loan loaded');
      })
      .catch(() => showToast('Failed to load active loan'));
  }, [showToast]);

  if (loan === undefined) {
    return (
      <Layout title="Active Loan" showBack>
        <SkeletonCard />
      </Layout>
    );
  }

  if (!loan) {
    return (
      <Layout title="Active Loan" showBack>
        <div className="empty-state card">
          <p>No active loan</p>
          <span className="text-muted">Apply for a loan to get started</span>
          <Button onClick={() => navigate('/loan/apply')}>Apply Now</Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Active Loan" showBack>
      <div className="card">
        <div className="summary-row">
          <span>Principal</span>
          <strong>Rp {(loan.principal ?? loan.amount).toLocaleString('id-ID')}</strong>
        </div>
        <div className="summary-row">
          <span>Remaining Balance</span>
          <strong>Rp {(loan.remaining_balance ?? 0).toLocaleString('id-ID')}</strong>
        </div>
        <div className="summary-row">
          <span>Tenor</span>
          <strong>{loan.tenor_month} months</strong>
        </div>
        {loan.next_due_date && (
          <div className="summary-row">
            <span>Next Due Date</span>
            <strong>{new Date(loan.next_due_date).toLocaleDateString('id-ID')}</strong>
          </div>
        )}
      </div>
      <Button className="btn-block" onClick={() => navigate('/installments')}>
        View Installments
      </Button>
    </Layout>
  );
}
