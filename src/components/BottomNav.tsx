import { NavLink } from 'react-router-dom';

const TABS = [
  {
    to: '/dashboard',
    label: 'Beranda',
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z"
          stroke="currentColor"
          strokeWidth="1.8"
          fill={active ? 'currentColor' : 'none'}
        />
      </svg>
    ),
  },
  {
    to: '/loan/apply',
    label: 'Ajukan',
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3v18M5 10h14M5 14h14"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
      </svg>
    ),
  },
  {
    to: '/installments',
    label: 'Tagihan',
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
        <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/profile',
    label: 'Profil',
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
        <path d="M5 20c0-4 3.5-6 7-6s7 2 7 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
] as const;

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Menu utama">
      {TABS.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
          end={to === '/dashboard'}
        >
          {({ isActive }) => (
            <>
              <span className="bottom-nav-icon">{icon(isActive)}</span>
              <span className="bottom-nav-label">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
