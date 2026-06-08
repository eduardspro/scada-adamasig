import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import ConnectionsPage from './pages/ConnectionsPage';
import VariablesPage from './pages/VariablesPage';
import ReactorPage from './pages/ReactorPage';
import { useEffect, useState } from 'react';
import { api } from './api';

export default function App() {
  const [user, setUser] = useState<{ id: number; username: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.get('/api/me')
        .then(res => setUser(res.data))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return <div className="loading">Cargando...</div>;
  }

  function handleLogout() {
    setUser(null);
    localStorage.removeItem('token');
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
      </Route>
      <Route path="*" element={<Navigate to={user ? '/connections' : '/login'} />} />
    </Routes>
  );
}
