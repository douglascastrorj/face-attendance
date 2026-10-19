import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Spinner } from '../components/ui';
import type { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { authenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (authenticated) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(password);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <h1>Área administrativa</h1>
        <p className="muted">Informe a senha definida em ADMIN_PASSWORD no arquivo .env.</p>
        <label className="field">
          <span>Senha</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
        </label>
        {error && <Alert kind="error">{error}</Alert>}
        <button className="btn btn-primary" disabled={busy || !password}>
          {busy ? <Spinner /> : 'Entrar'}
        </button>
        <a className="muted small center" href="/ponto">
          Ir para Bater Ponto
        </a>
      </form>
    </div>
  );
}
