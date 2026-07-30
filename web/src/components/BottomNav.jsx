import { NavLink } from 'react-router-dom';

// Minimal line icons in currentColor so the active tab picks up the orange.
const I = {
  plan: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>,
  credit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 19V10" /><path d="M10 19V5" /><path d="M16 19v-8" /><path d="M21 19H3" /></svg>,
  money: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /></svg>,
  team: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><circle cx="17" cy="9.5" r="2.5" /><path d="M16.5 14.6c2.4.3 4 2 4 4.4" /></svg>,
  learn: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5.5C10 4 7.5 3.5 4.5 3.5v15c3 0 5.5.5 7.5 2 2-1.5 4.5-2 7.5-2v-15c-3 0-5.5.5-7.5 2Z" /><path d="M12 5.5v15" /></svg>,
};

const tabs = [
  { to: '/', label: 'Plan', icon: I.plan, end: true },
  { to: '/credit', label: 'Credit', icon: I.credit },
  { to: '/money', label: 'Money', icon: I.money },
  { to: '/team', label: 'Team', icon: I.team },
  { to: '/learn', label: 'Learn', icon: I.learn },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav nav-5">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="nav-icon" aria-hidden>{t.icon}</span>
          <span className="nav-label">{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
