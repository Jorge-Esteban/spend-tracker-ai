import { useEffect, useState } from 'react';
import { formatMonthTitle, shiftMonth } from '../format.js';

export function Alert({ kind = 'info', children }) {
  return (
    <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export const Spinner = ({ label = 'Cargando…' }) => (
  <div className="spinner" role="status">
    <span className="spinner-dot" aria-hidden="true" /> {label}
  </div>
);

export function MonthPicker({ value, onChange }) {
  return (
    <div className="month-picker">
      <button className="btn ghost" aria-label="Mes anterior" onClick={() => onChange(shiftMonth(value, -1))}>
        ‹
      </button>
      <span className="month-label">{formatMonthTitle(value)}</span>
      <button className="btn ghost" aria-label="Mes siguiente" onClick={() => onChange(shiftMonth(value, 1))}>
        ›
      </button>
    </div>
  );
}

export function StatCard({ label, value, hint, tone }) {
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <strong className={`stat-value ${tone ?? ''}`}>{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

const STATUS_LABEL = { ok: 'En presupuesto', warning: 'Cerca del límite', exceeded: 'Superado', none: 'Sin presupuesto' };
export const BudgetBadge = ({ status }) => <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>;

/** Hook mínimo para cargar datos con estado de carga y error. */
export function useAsync(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
