import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

// Operator console shell (spec §5) — desktop-first, wider than the member app.
export default function OperatorLayout() {
  const { user, logout } = useAuth();
  const isAdmin = user.role === 'admin';
  const isManager = user.role === 'admin' || user.role === 'manager';
  return (
    <div className="op-shell">
      <aside className="op-side">
        <div className="op-brand">
          <span className="brand-logo-chip"><img src="/logo.png" alt="CHASE HomePath" className="brand-logo" /></span>
          <div className="op-role">{user.role} console</div>
        </div>
        <nav className="op-nav">
          <NavLink to="/" end>Clients</NavLink>
          <NavLink to="/team">Team</NavLink>
          <NavLink to="/inventory">Inventory</NavLink>
          {isManager && <NavLink to="/onboarding">Onboarding</NavLink>}
          {isAdmin && <NavLink to="/admin">HQ Admin</NavLink>}
        </nav>
        <button className="btn secondary op-signout" onClick={logout}>Sign out</button>
      </aside>
      <main className="op-main">
        <Outlet />
      </main>
    </div>
  );
}
