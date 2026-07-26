import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import BrandHeader from './components/BrandHeader.jsx';
import MemberLayout from './components/MemberLayout.jsx';
import OperatorLayout from './components/OperatorLayout.jsx';

// Auth
import Login from './screens/Login.jsx';
import Register from './screens/Register.jsx';

// Member surface
import PlanHome from './screens/PlanHome.jsx';
import Credit from './screens/Credit.jsx';
import CreditItem from './screens/CreditItem.jsx';
import Disputes from './screens/Disputes.jsx';
import Money from './screens/Money.jsx';
import Team from './screens/Team.jsx';
import Learn from './screens/Learn.jsx';
import Marketplace from './screens/Marketplace.jsx';
import PlanToLot from './screens/PlanToLot.jsx';
import Agent from './screens/Agent.jsx';
import Homeowner from './screens/Homeowner.jsx';

// Operator surface
import Roster from './screens/operator/Roster.jsx';
import ClientDetail from './screens/operator/ClientDetail.jsx';
import TeamDash from './screens/operator/TeamDash.jsx';
import Inventory from './screens/operator/Inventory.jsx';
import Admin from './screens/operator/Admin.jsx';
import Onboarding from './screens/operator/Onboarding.jsx';

// Partner surface
import PartnerHome from './screens/partner/PartnerHome.jsx';

const OPERATOR_ROLES = ['specialist', 'manager', 'admin'];

function MemberSurface() {
  return (
    <div className="app-shell">
      <BrandHeader />
      <Routes>
        <Route element={<MemberLayout />}>
          <Route path="/" element={<PlanHome />} />
          <Route path="/credit" element={<Credit />} />
          <Route path="/credit/items/:id" element={<CreditItem />} />
          <Route path="/money" element={<Money />} />
          <Route path="/team" element={<Team />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/marketplace/plans/:planId" element={<PlanToLot />} />
          <Route path="/agent" element={<Agent />} />
          <Route path="/home" element={<Homeowner />} />
          <Route path="/disputes" element={<Disputes />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function OperatorSurface() {
  return (
    <Routes>
      <Route element={<OperatorLayout />}>
        <Route path="/" element={<Roster />} />
        <Route path="/clients/:memberId" element={<ClientDetail />} />
        <Route path="/team" element={<TeamDash />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/admin" element={<Admin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function PartnerSurface() {
  return (
    <Routes>
      <Route path="/" element={<PartnerHome />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AuthSurface() {
  return (
    <div className="app-shell">
      <BrandHeader />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </div>
  );
}

function RoleRouter() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <AuthSurface />;
  if (OPERATOR_ROLES.includes(user.role)) return <OperatorSurface />;
  if (user.role === 'partner') return <PartnerSurface />;
  return <MemberSurface />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RoleRouter />
      </BrowserRouter>
    </AuthProvider>
  );
}
