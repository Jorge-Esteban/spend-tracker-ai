import { useState } from 'react';
import { api, errorMessage } from '../../api.js';
import { Alert, MonthPicker, Spinner, useAsync } from '../../components/ui.jsx';
import { formatMoney } from '../../format.js';
import ExpenseForm from './ExpenseForm.jsx';
import ExpenseList from './ExpenseList.jsx';

export default function ExpensesPage({ month, setMonth, categories, version, onChange }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState(null);

  const params = new URLSearchParams({ month, page: String(page), pageSize: '50' });
  if (query.trim()) params.set('q', query.trim());
  if (kind) params.set('kind', kind);
  const { data, error, loading } = useAsync(() => api.get(`/expenses?${params}`), [month, query, kind, page, version]);

  async function run(action) {
    setActionError(null);
    try {
      await action();
      onChange();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  // Neto de la página: ingresos suman, gastos restan.
  const pageNet = data?.items.reduce((s, e) => s + (e.kind === 'INCOME' ? e.amountCents : -e.amountCents), 0) ?? 0;

  return (
    <section className="stack">
      <div className="page-head">
        <h2>Movimientos</h2>
        <MonthPicker
          value={month}
          onChange={(m) => {
            setMonth(m);
            setPage(1);
          }}
        />
      </div>

      <ExpenseForm categories={categories} onCreated={onChange} />

      <div className="card stack">
        <div className="toolbar">
          <input
            type="search"
            placeholder="Buscar por descripción o comercio…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            aria-label="Buscar movimientos"
          />
          <select
            className="auto-width"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
            aria-label="Filtrar por tipo"
          >
            <option value="">Todos</option>
            <option value="EXPENSE">Gastos</option>
            <option value="INCOME">Ingresos</option>
          </select>
          <a className="btn" href={`/api/expenses/export.csv?month=${month}`} download>
            ⬇ Exportar CSV
          </a>
        </div>

        {actionError && <Alert kind="error">{actionError}</Alert>}
        {error && <Alert kind="error">{errorMessage(error)}</Alert>}
        {loading && !data && <Spinner />}
        {data && (
          <>
            <ExpenseList
              items={data.items}
              categories={categories}
              onCategory={(id, categoryId) => run(() => api.patch(`/expenses/${id}`, { categoryId }))}
              onDelete={(id) => run(() => api.del(`/expenses/${id}`))}
            />
            <div className="toolbar muted">
              <span>
                {data.total} movimientos · neto de esta página: {formatMoney(pageNet)}
              </span>
              {totalPages > 1 && (
                <span className="pager">
                  <button className="btn ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    ‹ Anterior
                  </button>
                  {page} / {totalPages}
                  <button className="btn ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Siguiente ›
                  </button>
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
