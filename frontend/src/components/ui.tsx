import { useEffect, useRef, type ReactNode } from 'react';

export function Alert({ kind, title, children }: { kind: 'error' | 'success' | 'info' | 'warning'; title?: string; children?: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {title && <strong>{title}</strong>}
      {children && <div>{children}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner-wrap" role="status" aria-live="polite">
      <span className="spinner" aria-hidden />
      {label && <span>{label}</span>}
    </span>
  );
}

export function Pagination({ page, totalPages, total, onChange }: { page: number; totalPages: number; total: number; onChange: (p: number) => void }) {
  return (
    <nav className="pagination" aria-label="Paginação">
      <span className="muted">
        {total} {total === 1 ? 'registro' : 'registros'}
      </span>
      <div className="pagination-buttons">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          ‹ Anterior
        </button>
        <span>
          Página {page} de {totalPages}
        </span>
        <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Próxima ›
        </button>
      </div>
    </nav>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={ref} className="dialog" onCancel={(e) => (e.preventDefault(), onCancel())}>
      <h2>{title}</h2>
      <div className="dialog-body">{children}</div>
      <div className="dialog-actions">
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>
          {busy ? <Spinner /> : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
