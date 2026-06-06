import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from './BottomNav';

interface LayoutProps {
  title?: string;
  children: ReactNode;
  showBack?: boolean;
  rightAction?: ReactNode;
  hideHeader?: boolean;
  showBottomNav?: boolean;
}

export function Layout({ title, children, showBack, rightAction, hideHeader, showBottomNav }: LayoutProps) {
  const navigate = useNavigate();

  return (
    <div className={`app-shell${showBottomNav ? ' has-bottom-nav' : ''}`}>
      {!hideHeader && (title || showBack || rightAction) && (
        <header className="app-header">
          {showBack && (
            <button type="button" className="back-btn" onClick={() => navigate(-1)} aria-label="Kembali">
              ←
            </button>
          )}
          {title && <h1 className="app-title">{title}</h1>}
          {rightAction && <div className="header-action">{rightAction}</div>}
        </header>
      )}
      <main className="app-main">{children}</main>
      {showBottomNav && <BottomNav />}
      <div id="sr-announce" className="sr-only" aria-live="polite" />
    </div>
  );
}
