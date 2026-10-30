import { useState } from 'react';
import { api, errorMessage } from '../../api.js';
import { Alert } from '../../components/ui.jsx';
import { todayIso } from '../../format.js';

const empty = () => ({ amount: '', description: '', merchant: '', date: todayIso(), categoryId: '' });

const ORIGIN_LABEL = { USER: 'elegida por ti', RULE: 'por una regla aprendida', AI: 'por la IA', FALLBACK: 'por defecto' };

export default function ExpenseForm({ categories, onCreated }) {
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const { expense } = await api.post('/expenses', {
        amount: form.amount,
        description: form.description,
        merchant: form.merchant || undefined,
        date: form.date,
        categoryId: form.categoryId || undefined,
      });
      setForm(empty());
      setMessage({
        kind: 'success',
        text: `Guardado en ${expense.category.icon} ${expense.category.name} (${ORIGIN_LABEL[expense.categorizedBy]}).`,
      });
      onCreated();
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={onSubmit}>
      <h3 className="span-all">Nuevo gasto</h3>
      <label>
        Importe (€)
        <input name="amount" inputMode="decimal" placeholder="12,50" required pattern="\d+([.,]\d{1,2})?" value={form.amount} onChange={onChange} />
      </label>
      <label>
        Descripción
        <input name="description" required maxLength={200} placeholder="Cena con amigos" value={form.description} onChange={onChange} />
      </label>
      <label>
        Comercio
        <input name="merchant" maxLength={120} placeholder="Opcional" value={form.merchant} onChange={onChange} />
      </label>
      <label>
        Fecha
        <input name="date" type="date" required value={form.date} onChange={onChange} />
      </label>
      <label>
        Categoría
        <select name="categoryId" value={form.categoryId} onChange={onChange}>
          <option value="">✨ Automática</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="form-actions">
        <button className="btn primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Añadir'}
        </button>
      </div>
      {message && (
        <div className="span-all">
          <Alert kind={message.kind}>{message.text}</Alert>
        </div>
      )}
    </form>
  );
}
