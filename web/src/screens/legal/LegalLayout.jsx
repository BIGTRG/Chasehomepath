import { Link } from 'react-router-dom';

// Shared shell for the legal pages. Public — reachable logged in or out.
export default function LegalLayout({ title, updated, children }) {
  return (
    <div className="content legal">
      <img src="/logo.png" alt="CHASE HomePath" className="auth-logo sm" style={{ margin: '6px auto 18px' }} />
      <h1 className="h1">{title}</h1>
      <p className="sub">Last updated: {updated}</p>
      {children}
      <div className="legal-foot">
        <Link to="/terms">Terms of Service</Link>
        <span aria-hidden="true"> · </span>
        <Link to="/privacy">Privacy Policy</Link>
        <span aria-hidden="true"> · </span>
        <a href="mailto:support@chasehomepath.com">support@chasehomepath.com</a>
      </div>
    </div>
  );
}
