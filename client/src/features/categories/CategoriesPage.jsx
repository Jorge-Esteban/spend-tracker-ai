import { useState } from 'react';
import { api, errorMessage } from '../../api.js';
import { Alert } from '../../components/ui.jsx';

const blank = { name: '', icon: '🏷️', color: '#6366f1', kind: 'EXPENSE' };
const GROUPS = [
  ['EXPENSE', 'Gastos'],
  ['INCOME', 'Ingresos'],
];

export default function CategoriesPage({ categories, onChange }) {
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState(null);

  async function run(action, success) {
    setMessage(null);
    try {
      const out = await action();
      setMessage({ kind: 'success', text: success(out) });
      onChange();
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) });
    }
  }

  return (
    <section className="stack">
      <div className="page-head">
        <h2>Categorías</h2>
      </div>

      <form
        className="card form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => api.post('/categories', form),
            () => {
              setForm(blank);
              return `Categoría «${form.name}» creada.`;
            },
          );
        }}
      >
        <h3 className="span-all">Nueva categoría</h3>
        <label>
          Nombre
          <input required maxLength={40} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Tipo
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="EXPENSE">Gasto</option>
            <option value="INCOME">Ingreso</option>
          </select>
        </label>
        <label>
          Icono
          <input maxLength={8} value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
        </label>
        <label>
          Color
          <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        </label>
        <div className="form-actions">
          <button className="btn primary">Crear</button>
        </div>
      </form>

      {message && <Alert kind={message.kind}>{message.text}</Alert>}

      {GROUPS.map(([kind, title]) => (
        <div className="card" key={kind}>
          <h3>{title}</h3>
          <ul className="category-list">
            {categories
              .filter((c) => c.kind === kind)
              .map((c) => (
                <li key={c.id}>
                  <input
                    type="color"
                    defaultValue={c.color}
                    aria-label={`Color de ${c.name}`}
                    onBlur={(e) =>
                      e.target.value !== c.color &&
                      run(() => api.patch(`/categories/${c.id}`, { color: e.target.value }), () => 'Color actualizado.')
                    }
                  />
                  <span className="category-name">
                    {c.icon} {c.name}
                  </span>
                  {c.isFallback ? (
                    <span className="muted small">Reserva: recibe lo que no encaja en otra</span>
                  ) : (
                    <button
                      className="btn ghost danger"
                      onClick={() =>
                        window.confirm(`¿Borrar «${c.name}»? Sus movimientos pasarán a la categoría de reserva.`) &&
                        run(
                          () => api.del(`/categories/${c.id}`),
                          (r) => `«${c.name}» borrada; ${r.reassignedExpenses} movimientos reasignados.`,
                        )
                      }
                    >
                      Borrar
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
