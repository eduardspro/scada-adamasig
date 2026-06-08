import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import ConnectionsPage from './pages/ConnectionsPage';
import VariablesPage from './pages/VariablesPage';
import ReactorPage from './pages/ReactorPage';
import Reactor2Page from './pages/Reactor2Page';
import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from './api';

interface User {
  id: number;
  username: string;
}

const INACTIVITY_MS = 3 * 60 * 1000; // 3 minutos

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('token');
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // Reset inactivity timer on user activity
  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      handleLogout();
    }, INACTIVITY_MS);
  }, [handleLogout]);

  // Check token on load
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.get<User>('/api/me')
        .then(userData => setUser(userData))
        .catch(() => {
          localStorage.removeItem('token');
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Activity tracking: start timer when user is set
  useEffect(() => {
    if (!user) return;

    resetTimer();

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    for (const ev of events) {
      window.addEventListener(ev, resetTimer);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const ev of events) {
        window.removeEventListener(ev, resetTimer);
      }
    };
  }, [user, resetTimer]);

  if (loading) {
    return <div className="loading">Cargando...</div>;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/connections" /> : <LoginPage onLogin={setUser} />}
      />
      <Route
        element={
          user ? (
            <Layout />
          ) : (
            <Navigate to="/login" />
          )
        }
      >
        <Route path="/connections" element={<ConnectionsPage user={user!} onLogout={handleLogout} />} />
        <Route path="/variables" element={<VariablesPage user={user!} onLogout={handleLogout} />} />
        <Route path="/reactor" element={<ReactorPage />} />
        <Route path="/reactor2" element={<Reactor2Page />} />
      </Route>
      <Route path="*" element={<Navigate to={user ? '/connections' : '/login'} />} />
    </Routes>
  );
}

export default function App() {
  return <AppContent />;
}
