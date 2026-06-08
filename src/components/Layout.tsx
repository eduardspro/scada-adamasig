import { NavLink, Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { api } from '../api';

export default function Layout() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `nav-link ${isActive ? 'active' : ''}`;

  // Polling global: lee todas las variables del PLC cada 1s
  useEffect(() => {
    const interval = setInterval(() => {
      api.post('/api/variables/read-all', {}).catch(() => {});
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">AdamaSig</div>
        <nav>
          <NavLink to="/connections" className={linkClass}>
            <span className="nav-icon">📡</span> Conexiones
          </NavLink>
          <NavLink to="/variables" className={linkClass}>
            <span className="nav-icon">📊</span> Variables
          </NavLink>
          <NavLink to="/reactor" className={linkClass}>
            <span className="nav-icon">⚗️</span> Reactor 1
          </NavLink>
          <NavLink to="/reactor2" className={linkClass}>
            <span className="nav-icon">⚗️</span> Reactor 2
          </NavLink>
          <NavLink to="/alarms" className={linkClass}>
            <span className="nav-icon">🚨</span> Alarmas
          </NavLink>

        </nav>
      </aside>
      <div className="main-area">
        <Outlet />
      </div>
    </div>
  );
}
