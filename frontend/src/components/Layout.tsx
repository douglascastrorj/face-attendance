import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/ponto', label: 'Bater Ponto' },
  { to: '/funcionarios', label: 'Funcionários', end: true },
  { to: '/funcionarios/novo', label: 'Cadastro' },
  { to: '/historico', label: 'Histórico' },
];

export function Layout() {
  const { authenticated, authDisabled, logout } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-dot" aria-hidden />
          Ponto Facial
          <button className="menu-toggle" aria-label="Abrir menu" onClick={() => setOpen((o) => !o)}>
            ☰
          </button>
        </div>
        <nav onClick={() => setOpen(false)}>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          {authDisabled && <span className="badge badge-warning">Autenticação desativada</span>}
          {authenticated && !authDisabled && (
            <button className="btn btn-ghost btn-sm" onClick={() => void logout()}>
              Sair
            </button>
          )}
          <p className="muted small">MVP técnico — não certificado para uso trabalhista.</p>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
