import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import BrandHeader from './components/BrandHeader.jsx';
import MemberLayout from './components/MemberLayout.jsx';
import Login from './screens/Login.jsx';
import Register from './screens/Register.jsx';
import PlanHome from './screens/PlanHome.jsx';
import Credit from './screens/Credit.jsx';
import CreditItem from './screens/CreditItem.jsx';
import Disputes from './screens/Disputes.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app-shell">
          <BrandHeader />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Authenticated member surface */}
            <Route element={<MemberLayout />}>
              <Route path="/" element={<PlanHome />} />
              <Route path="/credit" element={<Credit />} />
              <Route path="/credit/items/:id" element={<CreditItem />} />
              <Route path="/disputes" element={<Disputes />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
