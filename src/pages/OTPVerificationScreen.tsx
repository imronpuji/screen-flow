import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Layout } from '../components/Layout';
import { useAnnounce } from '../hooks/useAnnounce';
import { isValidOtp } from '../utils/validation';

const RESEND_SECONDS = 60;

export function OTPVerificationScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { email?: string; phone?: string } | null;
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(RESEND_SECONDS);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  useAnnounce(announcement);

  useEffect(() => {
    if (timer <= 0) return;
    const id = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [timer]);

  const handleVerify = async () => {
    setError('');
    if (!isValidOtp(otp)) {
      setError('Enter a valid 6-digit OTP');
      return;
    }

    setLoading(true);
    // OTP API out of scope — simulate verification
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    setAnnouncement('OTP verified successfully');
    navigate('/login', { state: { email: state?.email }, replace: true });
  };

  const handleResend = () => {
    if (timer > 0) return;
    setTimer(RESEND_SECONDS);
    setAnnouncement('OTP resent');
  };

  return (
    <Layout title="Verify OTP" showBack>
      <p className="text-muted">
        Enter the 6-digit code sent to {state?.phone ?? 'your phone'}
      </p>
      <div className="field">
        <label htmlFor="otp">OTP Code</label>
        <input
          id="otp"
          className={`input otp-input ${error ? 'input-error' : ''}`}
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          disabled={loading}
          aria-invalid={!!error}
        />
        {error && (
          <span className="field-msg" role="alert">
            {error}
          </span>
        )}
      </div>
      <Button loading={loading} className="btn-block" onClick={handleVerify}>
        Verify
      </Button>
      <button
        type="button"
        className="link-btn"
        disabled={timer > 0}
        onClick={handleResend}
      >
        {timer > 0 ? `Resend in ${timer}s` : 'Resend OTP'}
      </button>
    </Layout>
  );
}
