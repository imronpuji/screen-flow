import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface LayoutProps {
  title?: string;
  children: ReactNode;
  showBack?: boolean;
  rightAction?: ReactNode;
}

export function Layout({ title, children, showBack, rightAction }: LayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      {(title || showBack || rightAction) && (
        <header className="app-header">
          {showBack && (
            <button type="button" className="back-btn" onClick={() => navigate(-1)} aria-label="Go back">
              ←
            </button>
          )}
          {title && <h1 className="app-title">{title}</h1>}
          {rightAction && <div className="header-action">{rightAction}</div>}
        </header>
      )}
      <main className="app-main">{children}</main>
      <div id="sr-announce" className="sr-only" aria-live="polite" />
    </div>
  );
}
