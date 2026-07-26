import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/', label: 'Plan', icon: '🏠', end: true },
  { to: '/credit', label: 'Credit', icon: '📊' },
  { to: '/money', label: 'Money', icon: '💰' },
  { to: '/disputes', label: 'Disputes', icon: '📄' },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="nav-icon" aria-hidden>{t.icon}</span>
          <span className="nav-label">{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
