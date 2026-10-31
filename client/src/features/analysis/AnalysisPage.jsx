import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../../api.js';
import { Alert, Spinner } from '../../components/ui.jsx';
import { formatMoney } from '../../format.js';

const dateTime = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

export default function AnalysisPage({ plan }) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  const load = (refresh = false) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    (refresh ? api.post('/insights/refresh') : api.get('/insights'))
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => setState((s) => ({ ...s, error, loading: false })));
  };

  // StrictMode monta dos veces en desarrollo: evita pedir (y pagar) dos análisis a la vez.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    load();
  }, []);

  const { data, error, loading } = state;
  const insights = data?.insights;

  return (
    <section className="stack">
      <div className="page-head">
        <h2>Análisis con IA</h2>
        <button className="btn" onClick={() => load(true)} disabled={loading}>
          ↻ Regenerar
        </button>
      </div>
      <p className="muted">
        Claude analiza un resumen agregado de tus gastos e ingresos de los últimos 6 meses (nunca tus movimientos uno a uno). El resultado se guarda 24 h.
      </p>

      {loading && <Spinner label="Analizando tus gastos…" />}
      {error && <Alert kind={error.code === 'NO_DATA' ? 'info' : 'error'}>{errorMessage(error)}</Alert>}
      {data?.stale && (
        <Alert kind="info">Tus datos han cambiado desde este análisis. Pulsa «Regenerar» para actualizarlo.</Alert>
      )}

      {insights && (
        <>
          <div className="card">
            <h3>Resumen</h3>
            <p>{insights.summary}</p>
            <small className="muted">Generado el {dateTime.format(new Date(data.generatedAt))}</small>
          </div>

          {insights.alerts?.length > 0 && (
            <div className="card">
              <h3>Alertas</h3>
              <ul className="bullets">
                {insights.alerts.map((a, i) => (
                  <li key={i}>⚠️ {a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <h3>Patrones</h3>
            <ul className="bullets">
              {insights.patterns.map((p, i) => (
                <li key={i}>
                  <strong>{p.title}:</strong> {p.detail}
                </li>
              ))}
            </ul>
          </div>

          {insights.prediction ? (
            <div className="grid two">
              <div className="card">
                <h3>Predicción del mes que viene</h3>
                <p className="big">{formatMoney(insights.prediction.nextMonthTotalCents)}</p>
                <p className="muted">
                  Confianza {insights.prediction.confidence}. {insights.prediction.rationale}
                </p>
              </div>
              <div className="card">
                <h3>Recomendaciones</h3>
                <ul className="bullets">
                  {insights.recommendations.map((r, i) => (
                    <li key={i}>
                      <strong>{r.title}</strong> — {r.detail}{' '}
                      <span className="muted">(≈ {formatMoney(r.estimatedMonthlySavingsCents)}/mes)</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            plan === 'FREE' && (
              <Alert kind="info">Las predicciones y recomendaciones de ahorro personalizadas forman parte del plan PRO.</Alert>
            )
          )}
        </>
      )}
    </section>
  );
}
