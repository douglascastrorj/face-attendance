import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, PageHeader, Spinner } from '../components/ui';
import { api, ApiError, type Dashboard, type RecognitionHealth } from '../lib/api';

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [health, setHealth] = useState<RecognitionHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.dashboard().then(setData).catch((e: ApiError) => setError(e.message));
    api.recognitionHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <div className="page">
      <PageHeader title="Dashboard" subtitle={data ? `Hoje: ${data.date.split('-').reverse().join('/')} (${data.timezone})` : undefined} />
      {error && <Alert kind="error" title="Erro">{error}</Alert>}
      {health && health.status !== 'ok' && (
        <Alert kind="warning" title="Serviço de reconhecimento indisponível">
          {health.error ?? 'Verifique se o serviço Python está em execução (npm run dev).'}
        </Alert>
      )}
      {data && data.incompatible_embeddings > 0 && (
        <Alert kind="warning" title="Biometrias incompatíveis">
          {data.incompatible_embeddings} referência(s) biométrica(s) foram geradas por outro modelo e não são usadas no
          reconhecimento. Os funcionários afetados precisam de nova captura.
        </Alert>
      )}
      <div className="stats">
        <div className="card stat">
          <span className="stat-label">Funcionários ativos</span>
          <span className="stat-value">{data ? data.active_employees : '—'}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Registros hoje</span>
          <span className="stat-value">{data ? data.records_today : '—'}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Reconhecimento</span>
          <span className={`stat-value stat-small ${health?.status === 'ok' ? 'ok' : 'bad'}`}>
            {health ? (health.status === 'ok' ? `${health.model_name}/${health.model_version}` : 'Indisponível') : '—'}
          </span>
        </div>
      </div>
      <div className="shortcuts">
        <Link className="shortcut" to="/ponto">Bater Ponto</Link>
        <Link className="shortcut" to="/funcionarios/novo">Cadastrar funcionário</Link>
        <Link className="shortcut" to="/funcionarios">Funcionários</Link>
        <Link className="shortcut" to="/historico">Histórico</Link>
      </div>
      <div className="card table-card">
        <h2>Registros recentes</h2>
        {!data && !error ? (
          <Spinner label="Carregando…" />
        ) : data && data.recent.length === 0 ? (
          <p className="empty">Nenhum registro ainda.</p>
        ) : (
          data && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Data e hora</th>
                    <th>Funcionário</th>
                    <th>Similaridade</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap">{r.recorded_at_local}</td>
                      <td>{r.employee.name}</td>
                      <td>{r.similarity_score.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
