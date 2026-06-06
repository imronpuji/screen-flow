import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile } from '../api/users';
import { Spinner } from '../components/Spinner';
import { useAnnounce } from '../hooks/useAnnounce';
import { clearToken, hasValidToken } from '../utils/storage';

export function SplashScreen() {
  const navigate = useNavigate();
  const [announcement, setAnnouncement] = useState<string | null>('Loading application');
  useAnnounce(announcement);

  useEffect(() => {
    const bootstrap = async () => {
      if (!hasValidToken()) {
        navigate('/login', { replace: true });
        return;
      }

      try {
        await getProfile();
        setAnnouncement('Welcome back');
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
      <div className="logo" aria-hidden="true">
        LoanApp
      </div>
      <Spinner label="Loading application" />
    </div>
  );
}
