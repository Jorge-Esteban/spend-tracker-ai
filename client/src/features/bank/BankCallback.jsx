import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../../api.js';
import { Alert, Spinner } from '../../components/ui.jsx';

// Página a la que vuelve Tink: /bank/callback?code=...&state=...
export default function BankCallback({ onDone }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    // StrictMode monta dos veces en desarrollo: el código OAuth solo se puede usar una vez.
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    // Quita code/state de la barra de direcciones y del historial.
    window.history.replaceState({}, '', window.location.pathname);

    if (!code || !state) {
      setError(params.get('message') || 'Tink no devolvió autorización (¿cancelaste la conexión?).');
      return;
    }
    api
      .post('/bank/import', { code, state })
      .then(setResult)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <section className="card stack">
      <h2>Importación bancaria</h2>
      {!result && !error && <Spinner label="Importando y categorizando movimientos…" />}
      {error && <Alert kind="error">{error}</Alert>}
      {result && (
        <Alert kind="success">
          {result.imported} movimientos importados de {result.accounts} cuenta(s): {result.importedExpenses} gastos y{' '}
          {result.importedIncome} ingresos.
          {result.duplicates > 0 && ` ${result.duplicates} ya existían.`}
          {result.skipped.pending > 0 && ` ${result.skipped.pending} pendientes ignorados.`}
          {result.skippedByQuota > 0 && ` ${result.skippedByQuota} no caben en tu cuota mensual FREE.`}
        </Alert>
      )}
      {(result || error) && (
        <button className="btn primary" onClick={onDone}>
          Volver
        </button>
      )}
    </section>
  );
}
