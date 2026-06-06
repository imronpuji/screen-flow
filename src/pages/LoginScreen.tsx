import { useCallback, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { login } from '../api/auth';
import { ApiClientError } from '../api/client';
import {
  isBiometricEnabled,
  enrollFromToken,
  mockBiometricLoginDemo,
} from '../api/mock/biometric';
import { BiometricPrompt } from '../components/BiometricPrompt';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useAnnounce } from '../hooks/useAnnounce';
import { isValidEmail, isValidPassword } from '../utils/validation';

export function LoginScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefilledEmail = (location.state as { email?: string } | null)?.email ?? '';
  const { loginWithToken } = useAuth();
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricOpen, setBiometricOpen] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  useAnnounce(announcement);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!isValidEmail(email)) next.email = 'Masukkan email yang valid';
    if (!isValidPassword(password)) next.password = 'Password minimal 8 karakter';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;

    setLoading(true);
    try {
      const { access_token } = await login(email, password);
      await loginWithToken(access_token);
      enrollFromToken(access_token);
      setAnnouncement('Login berhasil');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message);
      } else {
        setServerError('Terjadi kesalahan. Coba lagi.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricScan = useCallback(async () => {
    const { access_token } = await mockBiometricLoginDemo();
    await loginWithToken(access_token);
  }, [loginWithToken]);

  const handleBiometricSuccess = useCallback(() => {
    setBiometricOpen(false);
    setAnnouncement('Login biometrik berhasil');
    navigate('/dashboard', { replace: true });
  }, [navigate]);

  return (
    <Layout hideHeader>
      <div className="auth-hero">
        <div className="gojek-logo" aria-hidden="true">
          <span className="logo-mark">G</span>
          <span className="logo-text">GoLoan</span>
        </div>
        <p className="auth-tagline">Pinjaman cepat, aman, terpercaya</p>
      </div>

      <form className="form auth-form" onSubmit={handleSubmit} noValidate>
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          disabled={loading}
          autoComplete="email"
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          disabled={loading}
          autoComplete="current-password"
          required
        />
        {serverError && (
          <p className="form-error" role="alert">
            {serverError}
          </p>
        )}
        <Button type="submit" loading={loading} className="btn-block">
          Masuk
        </Button>

        <div className="divider">
          <span>atau</span>
        </div>

        <button
          type="button"
          className="btn-biometric"
          onClick={() => setBiometricOpen(true)}
          disabled={loading}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="btn-biometric-icon">
            <path
              d="M12 2C9.5 2 7.5 4 7.5 6.5V9M16.5 6.5V9M7.5 15v2.5c0 2.5 2 4.5 4.5 4.5s4.5-2 4.5-4.5V15M9 11.5h6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          Masuk dengan Biometrik
        </button>

        <div className="demo-hint card">
          <strong>Demo</strong>
          <p className="text-muted">demo@loanapp.com / Password1</p>
          {isBiometricEnabled() && (
            <p className="text-muted biometric-enrolled">✓ Biometrik terdaftar</p>
          )}
        </div>

        <p className="form-footer">
          Belum punya akun? <Link to="/register">Daftar</Link>
        </p>
      </form>

      <BiometricPrompt
        open={biometricOpen}
        onScan={handleBiometricScan}
        onSuccess={handleBiometricSuccess}
        onCancel={() => setBiometricOpen(false)}
      />
    </Layout>
  );
}
