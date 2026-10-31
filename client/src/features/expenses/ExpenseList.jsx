import { formatDate, formatMoney } from '../../format.js';

const SOURCE = { MANUAL: '✍️', BANK: '🏦' };
const BY = { USER: 'Tú', RULE: 'Regla', AI: 'IA', FALLBACK: 'Auto' };

export default function ExpenseList({ items, categories, onCategory, onDelete }) {
  if (items.length === 0) return <p className="muted">No hay movimientos que mostrar.</p>;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Descripción</th>
            <th>Categoría</th>
            <th className="num">Importe</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id}>
              <td className="nowrap">{formatDate(e.date)}</td>
              <td>
                <span title={e.source === 'BANK' ? 'Importado del banco' : 'Manual'}>{SOURCE[e.source]}</span>{' '}
                {e.description}
                {e.merchant && <div className="muted small">{e.merchant}</div>}
              </td>
              <td>
                <select
                  aria-label="Cambiar categoría"
                  value={e.categoryId}
                  onChange={(ev) => onCategory(e.id, ev.target.value)}
                  title="Si la cambias, se recordará para este comercio"
                >
                  {categories.filter((c) => c.kind === e.kind).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
                <span className="tag">{BY[e.categorizedBy]}</span>
              </td>
              <td className={`num nowrap ${e.kind === 'INCOME' ? 'good' : ''}`}>
                {e.kind === 'INCOME' ? '+' : '−'}
                {formatMoney(e.amountCents, e.currency)}
              </td>
              <td>
                <button
                  className="btn ghost danger"
                  aria-label={`Borrar ${e.description}`}
                  onClick={() => window.confirm('¿Borrar este movimiento?') && onDelete(e.id)}
                >
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
