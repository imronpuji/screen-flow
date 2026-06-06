import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createLoan } from '../api/loans';
import { ApiClientError } from '../api/client';
import type { LoanApplicationDraft } from '../api/types';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { useToast } from '../context/ToastContext';
import { useAnnounce } from '../hooks/useAnnounce';

export function ReviewApplicationScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const draft = location.state as LoanApplicationDraft | null;
  const { showToast } = useToast();
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [announcement, setAnnouncement] = useState<string | null>(null);
  useAnnounce(announcement);

  useEffect(() => {
    if (!draft) navigate('/loan/apply', { replace: true });
  }, [draft, navigate]);

  if (!draft) return null;

  const handleSubmit = async () => {
    if (!confirmed) {
      setServerError('Please confirm the details');
      return;
    }

    setLoading(true);
    setServerError('');
    try {
      const loan = await createLoan(draft);
      setAnnouncement('Application submitted');
      navigate(`/loan/status/${loan.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message);
      } else {
        showToast('Submission failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Review Application" showBack>
      <div className="card summary-card">
        <div className="summary-row">
          <span>Amount</span>
          <strong>Rp {draft.amount.toLocaleString('id-ID')}</strong>
        </div>
        <div className="summary-row">
          <span>Tenor</span>
          <strong>{draft.tenor_month} months</strong>
        </div>
        <div className="summary-row">
          <span>Purpose</span>
          <strong>{draft.purpose}</strong>
        </div>
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={loading}
        />
        I confirm the details above are correct
      </label>

      {serverError && (
        <p className="form-error" role="alert">
          {serverError}
        </p>
      )}

      <div className="btn-row">
        <Button variant="secondary" onClick={() => navigate('/loan/apply', { state: draft })}>
          Edit
        </Button>
        <Button loading={loading} onClick={handleSubmit}>
          Submit
        </Button>
      </div>
    </Layout>
  );
}
