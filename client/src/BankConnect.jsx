import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';

// Tus credenciales de Tink
const TINK_CLIENT_ID = '472eb2de5ae54713aa591595e043d467';
const TINK_REDIRECT_URI = 'http://localhost:3000/callback';

function BankConnect({ onTransactionsImported }) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [authCode, setAuthCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const [syncHistory, setSyncHistory] = useState([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      console.log('✅ Código recibido:', code);
      setAuthCode(code);
      setIsConnected(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleConnectBank = () => {
    setIsConnecting(true);
    // URL para conectar a Imagin (banco real)
    const tinkAuthUrl = `https://link.tink.com/1.0/transactions/connect-accounts?client_id=${TINK_CLIENT_ID}&redirect_uri=${encodeURIComponent(TINK_REDIRECT_URI)}&market=ES`;

    console.log('🔗 Abriendo Tink Link para Imagin...');
    console.log('URL:', tinkAuthUrl);

    window.open(tinkAuthUrl, 'TinkConnect', 'width=600,height=700');

    const checkForCode = setInterval(() => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (code) {
        clearInterval(checkForCode);
        console.log('✅ Código interceptado:', code);
        setAuthCode(code);
        setIsConnecting(false);
        setIsConnected(true);
      }
    }, 500);

    setTimeout(() => {
      clearInterval(checkForCode);
      setIsConnecting(false);
    }, 300000);
  };

  const handleImportTransactions = async () => {
    if (!authCode) {
      setImportStatus({ type: 'error', message: 'Conecta tu banco primero' });
      return;
    }

    setLoading(true);
    setImportStatus({ type: 'loading', message: '⏳ Importando transacciones desde Imagin...' });

    try {
      console.log('📤 Enviando request con authCode:', authCode);
      const response = await axios.post(`${API_BASE}/bank/import`, { authCode });

      console.log('✅ Response:', response.data);

      setImportStatus({
        type: 'success',
        message: `✅ ${response.data.importedCount} transacciones importadas`,
        data: response.data
      });

      setSyncHistory([
        {
          date: new Date().toLocaleString('es-ES'),
          count: response.data.importedCount,
          status: 'success'
        },
        ...syncHistory.slice(0, 4)
      ]);

      if (onTransactionsImported) {
        onTransactionsImported();
      }
    } catch (error) {
      console.error('❌ Error:', error);
      setImportStatus({
        type: 'error',
        message: `❌ Error: ${error.response?.data?.error || error.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setAuthCode(null);
    setImportStatus(null);
    setImportStatus({ type: 'info', message: 'Banco desconectado' });
  };

  return (
    <div className="bank-connect-premium">
      {/* Header Premium */}
      <div className="bank-header">
        <div className="bank-header-content">
          <div className="bank-icon-large">🏦</div>
          <div className="bank-header-text">
            <h2>Conexión Bancaria Imagin</h2>
            <p>Sincroniza tus transacciones automáticamente desde Imagin</p>
          </div>
        </div>
      </div>

      {/* Status Card */}
      {isConnected && (
        <div className="status-card connected">
          <div className="status-check">✓</div>
          <div className="status-content">
            <h3>Imagin conectado</h3>
            <p>Tu cuenta está lista para importar transacciones</p>
          </div>
          <button className="btn-disconnect" onClick={handleDisconnect}>×</button>
        </div>
      )}

      {!isConnected && (
        <div className="status-card disconnected">
          <div className="status-icon">⚠️</div>
          <div className="status-content">
            <h3>No conectado</h3>
            <p>Conecta tu cuenta Imagin para importar transacciones automáticamente</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="bank-actions">
        {!isConnected ? (
          <button
            className="btn-primary-bank"
            onClick={handleConnectBank}
            disabled={isConnecting}
          >
            <span className="btn-icon">🔗</span>
            {isConnecting ? 'Conectando...' : '🔐 Conectar Imagin Real'}
          </button>
        ) : (
          <button
            className="btn-primary-bank active"
            onClick={handleImportTransactions}
            disabled={loading}
          >
            <span className="btn-icon">{loading ? '⏳' : '📥'}</span>
            {loading ? 'Importando...' : 'Importar Transacciones'}
          </button>
        )}
      </div>

      {/* Import Status */}
      {importStatus && (
        <div className={`import-status status-${importStatus.type}`}>
          <p>{importStatus.message}</p>
          {importStatus.data && (
            <div className="import-details">
              <span>✅ Importadas: {importStatus.data.importedCount}</span>
              <span>⏭️ Omitidas: {importStatus.data.skippedCount}</span>
              <span>📊 Total procesadas: {importStatus.data.totalProcessed}</span>
            </div>
          )}
        </div>
      )}

      {/* Sync History */}
      {syncHistory.length > 0 && (
        <div className="sync-history">
          <h4>📜 Historial de sincronización</h4>
          <div className="history-list">
            {syncHistory.map((sync, idx) => (
              <div key={idx} className="history-item">
                <span className="history-date">{sync.date}</span>
                <span className={`history-status status-${sync.status}`}>
                  {sync.count} transacciones
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Features */}
      <div className="bank-features">
        <h3>✨ Ventajas</h3>
        <div className="features-grid">
          <div className="feature">
            <span className="feature-icon">🔐</span>
            <p><strong>Seguro</strong><br/>OAuth 2.0 encriptado</p>
          </div>
          <div className="feature">
            <span className="feature-icon">⚡</span>
            <p><strong>Automático</strong><br/>Sincronización en tiempo real</p>
          </div>
          <div className="feature">
            <span className="feature-icon">🤖</span>
            <p><strong>Inteligente</strong><br/>Claude clasifica gastos</p>
          </div>
          <div className="feature">
            <span className="feature-icon">📊</span>
            <p><strong>Análisis</strong><br/>Insights personalizados</p>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="bank-info">
        <h4>¿Cómo funciona?</h4>
        <ol>
          <li><strong>Conecta:</strong> Autoriza tu cuenta Imagin con un clic</li>
          <li><strong>Importa:</strong> Descarga tus transacciones reales</li>
          <li><strong>Clasifica:</strong> Claude organiza automáticamente</li>
          <li><strong>Analiza:</strong> Obtén insights y recomendaciones</li>
        </ol>
      </div>

      {/* Advertencia */}
      <div style={{
        marginTop: '20px',
        padding: '15px',
        backgroundColor: '#fff3cd',
        border: '1px solid #ffc107',
        borderRadius: '8px',
        fontSize: '14px'
      }}>
        <strong>⚠️ Información importante:</strong><br/>
        Esta app conecta a tu cuenta Imagin a través de Tink (Open Banking PSD2).<br/>
        Tus credenciales se transfieren directamente a Imagin de forma segura.<br/>
        <strong>Nunca</strong> se guardan en nuestros servidores.
      </div>
    </div>
  );
}

export default BankConnect;
