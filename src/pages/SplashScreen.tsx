import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile } from '../api/users';
import { Spinner } from '../components/Spinner';
import { useAnnounce } from '../hooks/useAnnounce';
import { clearToken, hasValidToken } from '../utils/storage';

export function SplashScreen() {
  const navigate = useNavigate();
  const [announcement, setAnnouncement] = useState<string | null>('Memuat aplikasi');
  useAnnounce(announcement);

  useEffect(() => {
    const bootstrap = async () => {
      if (!hasValidToken()) {
        navigate('/login', { replace: true });
        return;
      }

      try {
        await getProfile();
        setAnnouncement('Selamat datang kembali');
        navigate('/dashboard', { replace: true });
      } catch {
        clearToken();
        navigate('/login', { replace: true });
      }
    };

    const timer = setTimeout(bootstrap, 800);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="splash-screen fullscreen-center">
      <div className="gojek-logo splash-logo" aria-hidden="true">
        <span className="logo-mark">G</span>
        <span className="logo-text">GoLoan</span>
      </div>
      <Spinner label="Memuat aplikasi" />
    </div>
  );
}
