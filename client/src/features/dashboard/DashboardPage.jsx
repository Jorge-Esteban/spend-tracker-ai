import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

function CategoryBreakdown({ title, rows, empty }) {
  const withAmount = rows.filter((c) => c.totalCents > 0);
  return (
    <div className="card">
      <h3>{title}</h3>
      {withAmount.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <>
          <div className="chart">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={withAmount} dataKey="totalCents" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {withAmount.map((c) => (
                    <Cell key={c.categoryId} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} formatter={(v, name) => [formatMoney(v), name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="legend">
            {withAmount.map((c) => (
              <li key={c.categoryId}>
                <span className="dot" style={{ background: c.color }} /> {c.icon} {c.name}
                <span className="legend-value">
                  {formatMoney(c.totalCents)} · {c.sharePct.toLocaleString('es-ES')} %
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function DashboardContent({ stats }) {
  const { totals, previous, byCategory, incomeByCategory, trend, budgets, usage } = stats;
  const delta = previous.deltaPct;
  const trendData = trend.map((t) => ({
    ...t,
    label: formatShortMonth(t.month),
    gastos: t.totalCents / 100,
    ingresos: t.incomeCents / 100,
  }));

  return (
    <>
      <div className="grid stats-grid">
        <StatCard label="Ingresos" value={formatMoney(totals.incomeCents)} tone="good" hint={`${totals.incomeCount} movimientos`} />
        <StatCard label="Gastos" value={formatMoney(totals.totalCents)} hint={`${totals.count} movimientos`} />
        <StatCard
          label="Balance"
          value={formatMoney(totals.balanceCents)}
          tone={totals.balanceCents >= 0 ? 'good' : 'bad'}
          hint={totals.balanceCents >= 0 ? 'Ahorras este mes' : 'Gastas más de lo que ingresas'}
        />
        <StatCard
          label="Gasto frente al mes anterior"
          value={formatPct(delta)}
          tone={delta === null ? '' : delta > 0 ? 'bad' : 'good'}
          hint={`${formatMonth(previous.month)}: ${formatMoney(previous.totalCents)}`}
        />
        <StatCard
          label="Presupuestos"
          value={
            budgets.exceeded
              ? `${budgets.exceeded} superado${budgets.exceeded > 1 ? 's' : ''}`
              : budgets.warning
                ? `${budgets.warning} en alerta`
                : 'Todo en orden'
          }
          tone={budgets.exceeded ? 'bad' : budgets.warning ? 'warn' : 'good'}
        />
      </div>

      {usage.limit !== null && (
        <Alert kind={usage.remaining === 0 ? 'error' : 'info'}>
          Plan FREE: llevas {usage.expenses} de {usage.limit} movimientos este mes.
        </Alert>
      )}

      <div className="card">
        <h3>Últimos 12 meses</h3>
        <div className="chart">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--muted)" fontSize={12} />
              <YAxis stroke="var(--muted)" fontSize={12} tickFormatter={(v) => formatCompactEuros(v * 100)} width={60} />
              <Tooltip
                {...tooltipStyle}
                formatter={(v, name) => [formatMoney(Math.round(v * 100)), name]}
                labelFormatter={(_, p) => p?.[0] && formatMonth(p[0].payload.month)}
              />
              <Legend />
              <Bar dataKey="ingresos" name="Ingresos" fill="var(--good)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="gastos" name="Gastos" fill="var(--accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid two">
        <CategoryBreakdown title="Gastos por categoría" rows={byCategory} empty="Sin gastos este mes." />
        <CategoryBreakdown title="Ingresos por categoría" rows={incomeByCategory} empty="Sin ingresos este mes." />
      </div>
    </>
  );
}
