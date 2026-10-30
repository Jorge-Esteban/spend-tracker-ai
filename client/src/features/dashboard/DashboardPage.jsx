import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errorMessage } from '../../api.js';
import { Alert, MonthPicker, Spinner, StatCard, useAsync } from '../../components/ui.jsx';
import { formatCompactEuros, formatMoney, formatMonth, formatPct, formatShortMonth } from '../../format.js';

const tooltipStyle = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 },
  labelStyle: { color: 'var(--text)' },
};

export default function DashboardPage({ month, setMonth, version }) {
  const { data: stats, error, loading } = useAsync(() => api.get(`/stats?month=${month}`), [month, version]);

  return (
    <section className="stack">
      <div className="page-head">
        <h2>Resumen</h2>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {loading && <Spinner />}
      {error && <Alert kind="error">{errorMessage(error)}</Alert>}
      {stats && <DashboardContent stats={stats} />}
    </section>
  );
}

function DashboardContent({ stats }) {
  const { totals, previous, byCategory, trend, budgets, usage } = stats;
  const delta = previous.deltaPct;
  const withSpend = byCategory.filter((c) => c.totalCents > 0);
  const trendData = trend.map((t) => ({ ...t, label: formatShortMonth(t.month), euros: t.totalCents / 100 }));

  return (
    <>
      <div className="grid stats-grid">
        <StatCard label={`Gastado en ${formatMonth(stats.month)}`} value={formatMoney(totals.totalCents)} hint={`${totals.count} movimientos`} />
        <StatCard
          label="Frente al mes anterior"
          value={formatPct(delta)}
          tone={delta === null ? '' : delta > 0 ? 'bad' : 'good'}
          hint={`${formatMonth(previous.month)}: ${formatMoney(previous.totalCents)}`}
        />
        <StatCard label="Gasto medio" value={formatMoney(totals.avgCents)} hint="por movimiento" />
        <StatCard
          label="Presupuestos"
          value={budgets.exceeded ? `${budgets.exceeded} superado${budgets.exceeded > 1 ? 's' : ''}` : budgets.warning ? `${budgets.warning} en alerta` : 'Todo en orden'}
          tone={budgets.exceeded ? 'bad' : budgets.warning ? 'warn' : 'good'}
        />
      </div>

      {usage.limit !== null && (
        <Alert kind={usage.remaining === 0 ? 'error' : 'info'}>
          Plan FREE: llevas {usage.expenses} de {usage.limit} movimientos este mes.
        </Alert>
      )}

      <div className="grid two">
        <div className="card">
          <h3>Últimos 12 meses</h3>
          <div className="chart">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted)" fontSize={12} />
                <YAxis stroke="var(--muted)" fontSize={12} tickFormatter={(v) => formatCompactEuros(v * 100)} width={60} />
                <Tooltip {...tooltipStyle} formatter={(v) => formatMoney(Math.round(v * 100))} labelFormatter={(_, p) => p?.[0] && formatMonth(p[0].payload.month)} />
                <Bar dataKey="euros" name="Gasto" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3>Por categoría</h3>
          {withSpend.length === 0 ? (
            <p className="muted">Sin gastos este mes.</p>
          ) : (
            <div className="chart">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={withSpend} dataKey="totalCents" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {withSpend.map((c) => (
                      <Cell key={c.categoryId} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} formatter={(v, name) => [formatMoney(v), name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <ul className="legend">
            {withSpend.map((c) => (
              <li key={c.categoryId}>
                <span className="dot" style={{ background: c.color }} /> {c.icon} {c.name}
                <span className="legend-value">
                  {formatMoney(c.totalCents)} · {c.sharePct.toLocaleString('es-ES')} %
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
