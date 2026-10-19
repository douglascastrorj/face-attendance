import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, ConfirmDialog, PageHeader, Pagination, Spinner } from '../components/ui';
import { api, ApiError, type Employee, type Paged } from '../lib/api';

export function EmployeesPage() {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<Employee> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toDeactivate, setToDeactivate] = useState<Employee | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        setData(await api.listEmployees({ name, code, status, page, page_size: 15 }, signal));
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError((err as ApiError).message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [name, code, status, page],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => void load(ctrl.signal), 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [load]);

  async function confirmDeactivate() {
    if (!toDeactivate) return;
    setDeactivating(true);
    try {
      const r = await api.deactivateEmployee(toDeactivate.id);
      setNotice(`${r.employee.name} foi desativado(a). ${r.biometric_samples_deleted} amostra(s) biométrica(s) excluída(s).`);
      setToDeactivate(null);
      await load();
    } catch (err) {
      setError((err as ApiError).message);
      setToDeactivate(null);
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Funcionários"
        actions={
          <Link className="btn btn-primary" to="/funcionarios/novo">
            + Cadastrar
          </Link>
        }
      />
      <div className="card filters">
        <label className="field">
          <span>Nome</span>
          <input type="search" value={name} onChange={(e) => (setName(e.target.value), setPage(1))} placeholder="Buscar por nome" />
        </label>
        <label className="field">
          <span>Identificador</span>
          <input type="search" value={code} onChange={(e) => (setCode(e.target.value), setPage(1))} placeholder="Buscar por identificador" />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
            <option value="all">Todos</option>
          </select>
        </label>
      </div>
      {notice && <Alert kind="success">{notice}</Alert>}
      {error && <Alert kind="error" title="Erro">{error}</Alert>}
      <div className="card table-card">
        {loading && !data ? (
          <Spinner label="Carregando…" />
        ) : data && data.items.length === 0 ? (
          <p className="empty">Nenhum funcionário encontrado.</p>
        ) : (
          data && (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Identificador</th>
                      <th>Status</th>
                      <th>Cadastro</th>
                      <th aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((e) => (
                      <tr key={e.id}>
                        <td>{e.name}</td>
                        <td>{e.employee_code ?? <span className="muted">—</span>}</td>
                        <td>
                          <span className={`badge ${e.active ? 'badge-success' : 'badge-muted'}`}>{e.active ? 'Ativo' : 'Inativo'}</span>
                        </td>
                        <td>{e.created_at_local}</td>
                        <td className="row-actions">
                          <Link className="btn btn-ghost btn-sm" to={`/historico?employee_id=${e.id}`}>
                            Histórico
                          </Link>
                          {e.active && (
                            <button className="btn btn-danger-ghost btn-sm" onClick={() => setToDeactivate(e)}>
                              Desativar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onChange={setPage} />
            </>
          )
        )}
      </div>
      <ConfirmDialog
        open={!!toDeactivate}
        title="Desativar funcionário?"
        confirmLabel="Desativar e excluir biometria"
        busy={deactivating}
        onConfirm={confirmDeactivate}
        onCancel={() => setToDeactivate(null)}
      >
        <p>
          <strong>{toDeactivate?.name}</strong> não poderá mais registrar ponto e seus dados biométricos serão
          excluídos definitivamente. O histórico de registros será preservado.
        </p>
        <p className="muted">Para reativar, será necessário um novo cadastro com nova captura facial.</p>
      </ConfirmDialog>
    </div>
  );
}
