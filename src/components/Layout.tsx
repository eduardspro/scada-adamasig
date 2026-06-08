import { NavLink, Outlet } from 'react-router-dom';

export default function Layout() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `nav-link ${isActive ? 'active' : ''}`;

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
