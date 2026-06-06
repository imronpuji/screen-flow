import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { createPayment } from '../api/payments';
import { ApiClientError } from '../api/client';
import type { Installment, Payment } from '../api/types';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { useToast } from '../context/ToastContext';
import { useAnnounce } from '../hooks/useAnnounce';

const METHODS = ['Virtual Account', 'Bank Transfer', 'E-Wallet'] as const;

export function PaymentScreen() {
  const { installmentId } = useParams<{ installmentId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const installment = (location.state as { installment?: Installment } | null)?.installment;
  const [method, setMethod] = useState<string>(METHODS[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Payment | null>(null);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState<string | null>(null);
  useAnnounce(announcement);

  const handlePay = async () => {
    if (!installmentId) return;
    setLoading(true);
    setError('');
    try {
      const payment = await createPayment(installmentId, method);
      setResult(payment);
      if (payment.status === 'success') {
        setAnnouncement('Payment successful');
        showToast('Payment successful', 'success');
      } else if (payment.status === 'pending') {
        setAnnouncement('Payment pending. Virtual account number displayed.');
      } else {
        setError('Payment failed. Please try again.');
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 422) {
        setError(err.message);
      } else if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        showToast('Payment failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const copyVa = () => {
    if (result?.va_number) {
      navigator.clipboard.writeText(result.va_number);
      showToast('VA number copied', 'success');
    }
  };

  return (
    <Layout title="Payment" showBack>
      {installment && (
        <div className="card summary-card">
          <div className="summary-row">
            <span>Amount</span>
            <strong>Rp {installment.amount.toLocaleString('id-ID')}</strong>
          </div>
          <div className="summary-row">
            <span>Due Date</span>
            <strong>{new Date(installment.due_date).toLocaleDateString('id-ID')}</strong>
          </div>
        </div>
      )}

      {!result && (
        <>
          <fieldset className="method-selector">
            <legend>Payment Method</legend>
            {METHODS.map((m) => (
              <label key={m} className="radio-row">
                <input
                  type="radio"
                  name="method"
                  value={m}
                  checked={method === m}
                  onChange={() => setMethod(m)}
                  disabled={loading}
                />
                {m}
              </label>
            ))}
          </fieldset>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <Button loading={loading} className="btn-block" onClick={handlePay}>
            Pay Now
          </Button>
        </>
      )}

      {result?.status === 'pending' && result.va_number && (
        <div className="card va-card">
          <p>Transfer to this Virtual Account:</p>
          <p className="va-number">{result.va_number}</p>
          <Button variant="secondary" onClick={copyVa}>
            Copy VA Number
          </Button>
        </div>
      )}

      {result?.status === 'success' && (
        <div className="card alert-success">
          <p>Payment successful!</p>
          <Button onClick={() => navigate('/installments')}>Back to Installments</Button>
        </div>
      )}

      {result?.status === 'failed' && (
        <div className="card alert-danger">
          <p>Payment failed</p>
          <Button onClick={() => setResult(null)}>Retry</Button>
        </div>
      )}
    </Layout>
  );
}
