import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import MemberLayout from './components/MemberLayout.jsx';
import OperatorLayout from './components/OperatorLayout.jsx';

// Auth
import Login from './screens/Login.jsx';
import Register from './screens/Register.jsx';
import Discover from './screens/Discover.jsx';
import Terms from './screens/legal/Terms.jsx';
import Privacy from './screens/legal/Privacy.jsx';
import Forgot from './screens/Forgot.jsx';
import Reset from './screens/Reset.jsx';

// Intake funnel (walkthrough 2-5)
import Qualify from './screens/Qualify.jsx';
import Received from './screens/Received.jsx';
import Schedule from './screens/Schedule.jsx';
import Prep from './screens/Prep.jsx';

// Member surface
import PlanHome from './screens/PlanHome.jsx';
import Credit from './screens/Credit.jsx';
import CreditItem from './screens/CreditItem.jsx';
import Disputes from './screens/Disputes.jsx';
import Money from './screens/Money.jsx';
import BudgetSetup from './screens/BudgetSetup.jsx';
import ScoreTrend from './screens/ScoreTrend.jsx';
import DisputeStart from './screens/DisputeStart.jsx';
import DisputeCase from './screens/DisputeCase.jsx';
import LetterView from './screens/LetterView.jsx';
import Team from './screens/Team.jsx';
import Learn from './screens/Learn.jsx';
import Marketplace from './screens/Marketplace.jsx';
import PlanToLot from './screens/PlanToLot.jsx';
import Agent from './screens/Agent.jsx';
import Homeowner from './screens/Homeowner.jsx';
import SmartCredit from './screens/SmartCredit.jsx';
import PlanReview from './screens/PlanReview.jsx';
import Readiness from './screens/Readiness.jsx';
import Lesson from './screens/Lesson.jsx';

// Onboarding v2
import StartHub from './screens/start/StartHub.jsx';
import CreditMonitoring from './screens/start/CreditMonitoring.jsx';
import Documents from './screens/start/Documents.jsx';
import Book from './screens/start/Book.jsx';
import Training from './screens/start/Training.jsx';
import MarenRoom from './screens/meet/MarenRoom.jsx';

// Billing + counseling
import Plans from './screens/billing/Plans.jsx';
import Checkout from './screens/billing/Checkout.jsx';
import Billing from './screens/billing/Billing.jsx';
import BookSession from './screens/billing/BookSession.jsx';
import Counseling from './screens/billing/Counseling.jsx';
import GroupPay from './screens/billing/GroupPay.jsx';
import Meet from './screens/meet/Meet.jsx';

// Operator surface
import Roster from './screens/operator/Roster.jsx';
import ClientDetail from './screens/operator/ClientDetail.jsx';
import TeamDash from './screens/operator/TeamDash.jsx';
import Inventory from './screens/operator/Inventory.jsx';
import Admin from './screens/operator/Admin.jsx';
import Onboarding from './screens/operator/Onboarding.jsx';
import BillingDash from './screens/operator/BillingDash.jsx';

// Partner surface
import PartnerHome from './screens/partner/PartnerHome.jsx';

const OPERATOR_ROLES = ['specialist', 'manager', 'admin'];

function MemberSurface() {
  return (
    <div className="app-shell">
      <Routes>
        {/* Intake funnel — no tab bar until the plan exists (walkthrough 2-5) */}
        <Route path="/qualify" element={<Qualify />} />
        <Route path="/received" element={<Received />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/prep" element={<Prep />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/checkout/:planCode" element={<Checkout />} />
        <Route path="/counseling" element={<Counseling />} />
        <Route path="/group/:id/pay" element={<GroupPay />} />
        <Route path="/start" element={<StartHub />} />
        <Route path="/start/credit" element={<CreditMonitoring />} />
        <Route path="/start/docs" element={<Documents />} />
        <Route path="/start/book" element={<Book />} />
        <Route path="/start/training" element={<Training />} />
        <Route path="/meet/maren/:id" element={<MarenRoom />} />
        <Route path="/meet/:code" element={<Meet />} />
        <Route path="/plan-review" element={<PlanReview />} />
        <Route element={<MemberLayout />}>
          <Route path="/" element={<PlanHome />} />
          <Route path="/credit" element={<Credit />} />
          <Route path="/credit/items/:id" element={<CreditItem />} />
          <Route path="/credit/items/:id/dispute" element={<DisputeStart />} />
          <Route path="/credit/cases/:id" element={<DisputeCase />} />
          <Route path="/credit/letters/:id" element={<LetterView />} />
          <Route path="/money" element={<Money />} />
          <Route path="/money/setup" element={<BudgetSetup />} />
          <Route path="/credit/scores" element={<ScoreTrend />} />
          <Route path="/team" element={<Team />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/:moduleId" element={<Lesson />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/marketplace/plans/:planId" element={<PlanToLot />} />
          <Route path="/agent" element={<Agent />} />
          <Route path="/home" element={<Homeowner />} />
          <Route path="/smartcredit" element={<SmartCredit />} />
          <Route path="/disputes" element={<Disputes />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/sessions/book" element={<BookSession />} />
          <Route path="/readiness" element={<Readiness />} />
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
        <Route path="/billing" element={<BillingDash />} />
        <Route path="/admin" element={<Admin />} />
      </Route>
      <Route path="/meet/:code" element={<Meet />} />
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
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/reset" element={<Reset />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/counseling" element={<Counseling />} />
        <Route path="*" element={<Navigate to="/discover" replace />} />
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
