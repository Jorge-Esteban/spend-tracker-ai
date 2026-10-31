import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api.js';
import { Alert, Spinner, useAsync } from '../../components/ui.jsx';

const dateTime = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
const DEFAULT_BANK = 'imagin';

export default function BankPage({ version }) {
  const { data: status, error, loading } = useAsync(() => api.get('/bank/status'), [version]);
  const ebEnabled = Boolean(status?.providers?.enablebanking?.enabled);
  const tink = status?.providers?.tink;

  const [banks, setBanks] = useState([]);
  const [bank, setBank] = useState(DEFAULT_BANK);
  const [connectError, setConnectError] = useState(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!ebEnabled) return;
    api
      .get('/bank/aspsps')
      .then((d) => {
        setBanks(d.aspsps);
        if (!d.aspsps.some((b) => b.name === DEFAULT_BANK) && d.aspsps[0]) setBank(d.aspsps[0].name);
      })
      .catch((err) => setConnectError(errorMessage(err)));
  }, [ebEnabled]);

  // Flujo de página completa: el banco vuelve a /bank/callback con code y state.
  async function connect(params) {
    setConnectError(null);
    setRedirecting(true);
    try {
      const { url } = await api.get(`/bank/connect-url?${new URLSearchParams(params)}`);
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
        <>
          <div className="card stack">
            <p>
              Importa tus gastos e ingresos mediante open banking (PSD2). Cada importación es puntual: la app no guarda
              acceso permanente a tu cuenta, y los movimientos ya importados no se duplican.
            </p>

            {ebEnabled ? (
              <div className="toolbar">
                <label className="grow">
                  Tu banco
                  <select value={bank} onChange={(e) => setBank(e.target.value)} disabled={!banks.length}>
                    {banks.length === 0 && <option>Cargando bancos…</option>}
                    {banks.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                        {b.beta ? ' (beta)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="btn primary"
                  onClick={() => connect({ provider: 'enablebanking', aspsp: bank })}
                  disabled={redirecting || !banks.length}
                >
                  {redirecting ? 'Abriendo tu banco…' : '🏦 Conectar e importar'}
                </button>
              </div>
            ) : (
              <Alert kind="info">La conexión con bancos reales no está configurada en este servidor.</Alert>
            )}

            {tink?.enabled && (
              <p className="muted small">
                ¿Solo quieres probar?{' '}
                <button className="btn ghost" onClick={() => connect({ provider: 'tink' })} disabled={redirecting}>
                  Usar el banco de demostración (Tink)
                </button>
              </p>
            )}
            {connectError && <Alert kind="error">{connectError}</Alert>}
          </div>

          <p className="muted">
            {status.bankExpenses} movimientos importados
            {status.lastImportAt && ` · última importación: ${dateTime.format(new Date(status.lastImportAt))}`}
          </p>
        </>
      )}
    </section>
  );
}
