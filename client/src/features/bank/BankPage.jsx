import { useState } from 'react';
import { api, errorMessage } from '../../api.js';
import { Alert, Spinner, useAsync } from '../../components/ui.jsx';

const dateTime = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

export default function BankPage({ version }) {
  const { data: status, error, loading } = useAsync(() => api.get('/bank/status'), [version]);
  const [connectError, setConnectError] = useState(null);
  const [redirecting, setRedirecting] = useState(false);

  async function connect() {
    setConnectError(null);
    setRedirecting(true);
    try {
      const { url } = await api.get('/bank/connect-url');
      // Flujo de página completa: Tink vuelve a /bank/callback con code y state.
      window.location.assign(url);
    } catch (err) {
      setConnectError(errorMessage(err));
      setRedirecting(false);
    }
  }

  return (
    <section className="stack">
      <div className="page-head">
        <h2>Importar del banco</h2>
      </div>
      {loading && <Spinner />}
      {error && <Alert kind="error">{errorMessage(error)}</Alert>}
      {status && (
        <div className="card stack">
          <p>
            Importa tus gastos e ingresos mediante <strong>Tink</strong> (open banking). Cada importación es puntual: la app no guarda
            acceso permanente a tu cuenta, y los movimientos ya importados no se duplican.
          </p>
          {status.testMode && (
            <Alert kind="info">
              Modo de pruebas: Tink mostrará bancos de demostración (Demo Bank). Los bancos reales requieren una app de
              producción en Tink.
            </Alert>
          )}
          {!status.enabled ? (
            <Alert kind="info">La conexión bancaria no está configurada en este servidor.</Alert>
          ) : (
            <button className="btn primary" onClick={connect} disabled={redirecting}>
              {redirecting ? 'Abriendo Tink…' : '🏦 Conectar e importar'}
            </button>
          )}
          {connectError && <Alert kind="error">{connectError}</Alert>}
          <p className="muted">
            {status.bankExpenses} movimientos importados
            {status.lastImportAt && ` · última importación: ${dateTime.format(new Date(status.lastImportAt))}`}
          </p>
        </div>
      )}
    </section>
  );
}
