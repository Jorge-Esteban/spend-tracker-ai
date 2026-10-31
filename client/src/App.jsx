import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './auth/AuthContext.jsx';
import AuthPage from './auth/AuthPage.jsx';
import { Spinner } from './components/ui.jsx';
import AnalysisPage from './features/analysis/AnalysisPage.jsx';
import BankCallback from './features/bank/BankCallback.jsx';
import BankPage from './features/bank/BankPage.jsx';
import BudgetsPage from './features/budgets/BudgetsPage.jsx';
import CategoriesPage from './features/categories/CategoriesPage.jsx';
import DashboardPage from './features/dashboard/DashboardPage.jsx';
import ExpensesPage from './features/expenses/ExpensesPage.jsx';
import { currentMonthKey } from './format.js';
import { useTheme } from './theme.js';

const TABS = [
  { id: 'dashboard', label: 'Resumen' },
  { id: 'expenses', label: 'Movimientos' },
  { id: 'budgets', label: 'Presupuestos' },
  { id: 'analysis', label: 'Análisis IA' },
  { id: 'bank', label: 'Banco' },
  { id: 'categories', label: 'Categorías' },
];

export default function App() {
  const { user, loading, logout } = useAuth();
  const [theme, toggleTheme] = useTheme();
  const [tab, setTab] = useState('dashboard');
  const [month, setMonth] = useState(currentMonthKey);
  const [categories, setCategories] = useState([]);
  // Se incrementa tras cualquier cambio de datos para que las vistas recarguen.
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  // Vuelta de Tink: /bank/callback (recomendada) o /callback (redirect URI de la v1).
  const isCallback = ['/bank/callback', '/callback'].includes(window.location.pathname);

  const loadCategories = useCallback(async () => {
    const d = await api.get('/categories');
    setCategories(d.categories);
  }, []);

  useEffect(() => {
    if (user) loadCategories().catch(() => setCategories([]));
  }, [user, loadCategories, version]);

  if (loading) return <Spinner />;
  if (!user) return <AuthPage />;

  const shared = { month, setMonth, categories, version, onChange: bump };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">💶 Spend Tracker AI</div>
        <div className="topbar-actions">
          <span className={`plan-badge ${user.plan.toLowerCase()}`} title="Tu plan">
            {user.plan}
          </span>
          <button
            className="btn ghost icon"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <span className="muted user-email">{user.email}</span>
          <button className="btn ghost" onClick={logout}>
            Salir
          </button>
        </div>
      </header>

      {isCallback ? (
        <main className="container">
          <BankCallback
            onDone={() => {
              window.history.replaceState({}, '', '/');
              bump();
              setTab('bank');
            }}
          />
        </main>
      ) : (
        <>
          <nav className="tabs" aria-label="Secciones">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? 'active' : ''}
                aria-current={tab === t.id ? 'page' : undefined}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <main className="container">
            {tab === 'dashboard' && <DashboardPage {...shared} />}
            {tab === 'expenses' && <ExpensesPage {...shared} />}
            {tab === 'budgets' && <BudgetsPage {...shared} />}
            {tab === 'analysis' && <AnalysisPage {...shared} plan={user.plan} />}
            {tab === 'bank' && <BankPage {...shared} />}
            {tab === 'categories' && <CategoriesPage {...shared} />}
          </main>
        </>
      )}
    </div>
  );
}
