import { useState } from 'react';
import { api, errorMessage } from '../../api.js';
import { Alert, BudgetBadge, MonthPicker, Spinner, useAsync } from '../../components/ui.jsx';
import { formatMoney } from '../../format.js';

export default function BudgetsPage({ month, setMonth, categories, version, onChange }) {
  const { data: stats, error, loading } = useAsync(() => api.get(`/stats?month=${month}`), [month, version]);
  const [saveError, setSaveError] = useState(null);
  const spentById = new Map((stats?.byCategory ?? []).map((r) => [r.categoryId, r]));

  async function saveBudget(categoryId, raw) {
    setSaveError(null);
    const value = raw.trim().replace(',', '.');
    const monthlyBudget = value === '' ? null : Number(value);
    if (monthlyBudget !== null && (!Number.isFinite(monthlyBudget) || monthlyBudget < 0)) {
      setSaveError('Introduce un importe válido o déjalo vacío para quitar el presupuesto.');
      return;
    }
    try {
      await api.patch(`/categories/${categoryId}`, { monthlyBudget });
      onChange();
    } catch (err) {
      setSaveError(errorMessage(err));
    }
  }

  return (
    <section className="stack">
      <div className="page-head">
        <h2>Presupuestos</h2>
        <MonthPicker value={month} onChange={setMonth} />
      </div>
      <p className="muted">Fija un límite mensual por categoría. Te avisamos al llegar al 80 % y al superarlo.</p>
      {saveError && <Alert kind="error">{saveError}</Alert>}
      {error && <Alert kind="error">{errorMessage(error)}</Alert>}
      {loading && !stats && <Spinner />}

      <div className="grid budgets">
        {categories.filter((c) => c.kind === 'EXPENSE').map((c) => {
          const row = spentById.get(c.id);
          const spent = row?.totalCents ?? 0;
          const budget = c.monthlyBudgetCents;
          const status = row?.budgetStatus ?? (budget === null ? 'none' : 'ok');
          const pct = budget ? Math.min(100, (spent / budget) * 100) : 0;
          return (
            <div key={c.id} className="card budget">
              <div className="budget-head">
                <strong>
                  {c.icon} {c.name}
                </strong>
                <BudgetBadge status={status} />
              </div>
              <div className="budget-amounts">
                <span>{formatMoney(spent)}</span>
                <span className="muted">{budget === null ? 'sin límite' : `de ${formatMoney(budget)}`}</span>
              </div>
              {budget !== null && (
                <div
                  className={`progress ${status}`}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(pct)}
                  aria-label={`Presupuesto de ${c.name}`}
                >
                  <span style={{ width: `${pct}%` }} />
                </div>
              )}
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveBudget(c.id, new FormData(e.currentTarget).get('budget'));
                }}
              >
                <input
                  name="budget"
                  inputMode="decimal"
                  placeholder="Límite en €"
                  defaultValue={budget === null ? '' : String(budget / 100).replace('.', ',')}
                  aria-label={`Presupuesto mensual de ${c.name}`}
                  key={`${c.id}-${budget}`}
                />
                <button className="btn">Guardar</button>
              </form>
            </div>
          );
        })}
      </div>
    </section>
  );
}
