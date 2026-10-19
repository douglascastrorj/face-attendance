import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, PageHeader, Pagination, Spinner } from '../components/ui';
import { api, ApiError, type Employee, type Paged, type TimeRecord } from '../lib/api';

export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const employeeId = params.get('employee_id') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Number(params.get('page') ?? 1) || 1;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [data, setData] = useState<Paged<TimeRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Inclui inativos: o histórico deles continua consultável.
    api
      .listEmployees({ status: 'all', page_size: 100 })
      .then((r) => setEmployees(r.items))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listAttendance({ employee_id: employeeId ? Number(employeeId) : undefined, from, to, page, page_size: 20 })
      .then((r) => !cancelled && setData(r))
      .catch((e: ApiError) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [employeeId, from, to, page]);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }

  return (
    <div className="page">
      <PageHeader title="Histórico de pontos" subtitle="Horários exibidos em America/Sao_Paulo (Brasília)." />
      <div className="card filters">
        <label className="field">
          <span>Funcionário</span>
          <select value={employeeId} onChange={(e) => update('employee_id', e.target.value)}>
            <option value="">Todos</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.employee_code ? ` (${e.employee_code})` : ''}
                {e.active ? '' : ' — inativo'}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>De</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => update('from', e.target.value)} />
        </label>
        <label className="field">
          <span>Até</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => update('to', e.target.value)} />
        </label>
        {(employeeId || from || to) && (
          <button className="btn btn-ghost filters-clear" onClick={() => setParams(new URLSearchParams())}>
            Limpar filtros
          </button>
        )}
      </div>
      {error && <Alert kind="error" title="Erro">{error}</Alert>}
      <div className="card table-card">
        {loading && !data ? (
          <Spinner label="Carregando…" />
        ) : data && data.items.length === 0 ? (
          <p className="empty">Nenhum registro encontrado.</p>
        ) : (
          data && (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Data e hora</th>
                      <th>Funcionário</th>
                      <th>Identificador</th>
                      <th>Similaridade</th>
                      <th>Modelo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((r) => (
                      <tr key={r.id}>
                        <td className="nowrap">{r.recorded_at_local}</td>
                        <td>
                          {r.employee.name} {!r.employee.active && <span className="badge badge-muted">inativo</span>}
                        </td>
                        <td>{r.employee.employee_code ?? <span className="muted">—</span>}</td>
                        <td>{r.similarity_score.toFixed(3)}</td>
                        <td className="muted">
                          {r.model_name}/{r.model_version}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onChange={(p) => update('page', String(p))} />
            </>
          )
        )}
      </div>
    </div>
  );
}
