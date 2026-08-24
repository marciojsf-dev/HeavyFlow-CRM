import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Board } from './pages/Board';
import { Chat } from './pages/Chat';
import { Templates } from './pages/Templates';
import { Team } from './pages/Team';

import { Dashboard } from './pages/Dashboard';
import { Inbox } from './pages/Inbox';
import { Campaigns } from './pages/Campaigns';
import { Settings } from './pages/Settings';
import { CompanySettings } from './pages/CompanySettings';
import { Contacts } from './pages/Contacts';
import { WhatsAppConnect } from './pages/WhatsAppConnect';
import { AdminHub } from './pages/AdminHub';
import { Billing } from './pages/Billing';
import { Privacy } from './pages/public/Privacy';
import { Terms } from './pages/public/Terms';
import { DataDeletion } from './pages/public/DataDeletion';
import { Onboarding } from './pages/Onboarding';

import { useLocation } from 'react-router-dom';

function PrivateRoute({ children, adminOnly, billingRoute }: { children: React.ReactNode, adminOnly?: boolean, billingRoute?: boolean }) {
  const { user, profile, loading, } = useAuth();
  
  
  const location = useLocation();
  
  if (loading) return <div className="h-screen w-screen flex items-center justify-center">Carregando...</div>;
  if (!user || !profile) return <Navigate to="/login" />;
  
  if (profile.role === 'admin' && profile.companySetupComplete !== true) {
    return <Navigate to="/onboarding" />;
  }

  const isSuperAdmin = profile.isSuperAdmin === true;
  const status = profile.subscriptionStatus;
  const hasValidSubscription = isSuperAdmin || status === 'active' || status === 'trialing';

  // Allow access if it's the billing route OR if we are currently at /billing
  const isBillingAllowed = billingRoute || location.pathname === '/billing';

  if (!hasValidSubscription && !isBillingAllowed) {
    if (profile.role === 'admin') {
      return <Navigate to="/billing" />;
    } else {
      return <div className="h-screen flex items-center justify-center bg-zinc-50 p-6 text-center text-zinc-500">A assinatura da sua empresa está inativa. Peça ao administrador para regularizar o acesso.</div>;
    }
  }

  if (adminOnly && profile.role !== 'admin') {
    return <Navigate to="/dashboard" />;
  }
  
  return <>{children}</>;
}

import { Toaster } from 'sonner';

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/data-deletion" element={<DataDeletion />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Navigate to="/dashboard" />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="board" element={<Board />} />
            <Route path="inbox" element={<Inbox />}>
              <Route path=":id" element={<Chat />} />
            </Route>
            <Route path="campaigns" element={<PrivateRoute adminOnly><Campaigns /></PrivateRoute>} />
            <Route path="contacts" element={<PrivateRoute adminOnly><Contacts /></PrivateRoute>} />
            <Route path="templates" element={<PrivateRoute adminOnly><Templates /></PrivateRoute>} />
            <Route path="team" element={<PrivateRoute adminOnly><Team /></PrivateRoute>} />
            <Route path="connect" element={<PrivateRoute adminOnly><WhatsAppConnect /></PrivateRoute>} />
            <Route path="billing" element={<PrivateRoute adminOnly billingRoute><Billing /></PrivateRoute>} />
            <Route path="settings" element={<PrivateRoute adminOnly><Settings /></PrivateRoute>} />
            <Route path="company-settings" element={<PrivateRoute adminOnly><CompanySettings /></PrivateRoute>} />
            <Route path="admin-hub" element={<PrivateRoute adminOnly><AdminHub /></PrivateRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
