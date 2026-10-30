import { useState } from 'react';
import { errorMessage } from '../api.js';
import { Alert } from '../components/ui.jsx';
import { useAuth } from './AuthContext.jsx';

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isLogin) await login(form.email, form.password);
      else await register(form.email, form.password, form.name);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="card auth-card">
        <h1 className="brand">💶 Spend Tracker AI</h1>
        <p className="muted">Registra tus gastos, controla presupuestos y obtén un análisis con IA.</p>

        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={isLogin} className={isLogin ? 'active' : ''} onClick={() => setMode('login')}>
            Entrar
          </button>
          <button role="tab" aria-selected={!isLogin} className={!isLogin ? 'active' : ''} onClick={() => setMode('register')}>
            Crear cuenta
          </button>
        </div>

        <form onSubmit={onSubmit} className="stack">
          {!isLogin && (
            <label>
              Nombre <span className="muted">(opcional)</span>
              <input name="name" value={form.name} onChange={onChange} autoComplete="name" maxLength={80} />
            </label>
          )}
          <label>
            Email
            <input name="email" type="email" required value={form.email} onChange={onChange} autoComplete="email" />
          </label>
          <label>
            Contraseña
            <input
              name="password"
              type="password"
              required
              minLength={isLogin ? 1 : 8}
              value={form.password}
              onChange={onChange}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
            {!isLogin && <small className="muted">Mínimo 8 caracteres.</small>}
          </label>
          {error && <Alert kind="error">{error}</Alert>}
          <button className="btn primary" disabled={busy}>
            {busy ? 'Un momento…' : isLogin ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </main>
  );
}
