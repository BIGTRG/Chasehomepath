import { Outlet } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.jsx';
import BottomNav from './BottomNav.jsx';

// Shell for the authenticated member surface: content + bottom tab nav.
export default function MemberLayout() {
  return (
    <ProtectedRoute>
      <div className="member-body">
        <Outlet />
      </div>
      <BottomNav />
    </ProtectedRoute>
  );
}
