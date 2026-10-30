import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import BankConnect from './BankConnect';
import './App.css';

const API_BASE = 'http://localhost:5000/api';

function App() {
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState([]);
  const [form, setForm] = useState({
    amount: '',
    description: '',
    merchant: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [predictions, setPredictions] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [activeTab, setActiveTab] = useState('expenses');

  const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BDC3C7'];

  // Cargar gastos al montar
  useEffect(() => {
    fetchExpenses();
    fetchSummary();
  }, []);

  const fetchExpenses = async () => {
    try {
      const response = await axios.get(`${API_BASE}/expenses`);
      setExpenses(response.data || []);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await axios.get(`${API_BASE}/expenses/summary`);
      setSummary(response.data || []);
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!form.amount || !form.date) {
      alert('Por favor completa los campos requeridos');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_BASE}/expenses`, {
        amount: parseFloat(form.amount),
        description: form.description,
        merchant: form.merchant,
        date: form.date
      });

      setForm({
        amount: '',
        description: '',
        merchant: '',
        date: new Date().toISOString().split('T')[0]
      });

      fetchExpenses();
      fetchSummary();
    } catch (error) {
      alert('Error al agregar gasto: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExpense = async (id) => {
    if (window.confirm('¿Estás seguro?')) {
      try {
        await axios.delete(`${API_BASE}/expenses/${id}`);
        fetchExpenses();
        fetchSummary();
      } catch (error) {
        alert('Error al eliminar gasto: ' + error.message);
      }
    }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const [analysisRes, predictionsRes, recommendationsRes] = await Promise.all([
        axios.get(`${API_BASE}/analysis/spending-analysis`),
        axios.get(`${API_BASE}/analysis/predictions`),
        axios.get(`${API_BASE}/analysis/recommendations`)
      ]);

      setAnalysis(analysisRes.data);
      setPredictions(predictionsRes.data);
      setRecommendations(recommendationsRes.data);
    } catch (error) {
      alert('Error al analizar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Calcular total gastado
  const totalSpent = summary.reduce((sum, cat) => sum + (cat.total_spent || 0), 0);

  return (
    <div className="app">
      <header className="header">
        <h1>💰 Spend Tracker AI</h1>
        <p>Gestiona tus gastos con inteligencia artificial</p>
      </header>

      <nav className="tabs">
        <button 
          className={`tab ${activeTab === 'expenses' ? 'active' : ''}`} 
          onClick={() => setActiveTab('expenses')}
        >
          📝 Gastos
        </button>
        <button 
          className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`} 
          onClick={() => setActiveTab('dashboard')}
        >
          📊 Dashboard
        </button>
        <button 
          className={`tab ${activeTab === 'analysis' ? 'active' : ''}`} 
          onClick={() => setActiveTab('analysis')}
        >
          🔍 Análisis
        </button>
      </nav>

      <div className="container">
        {/* TAB: AGREGAR GASTOS */}
        {activeTab === 'expenses' && (
          <div className="section">
            <BankConnect onTransactionsImported={fetchExpenses} />

            <div className="form-card">
              <h2>Agregar nuevo gasto</h2>
              <form onSubmit={handleAddExpense}>
                <div className="form-group">
                  <label>Cantidad (€) *</label>
                  <input
                    type="number"
                    step="0.01"
                    name="amount"
                    value={form.amount}
                    onChange={handleInputChange}
                    placeholder="25.50"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Descripción</label>
                  <input
                    type="text"
                    name="description"
                    value={form.description}
                    onChange={handleInputChange}
                    placeholder="ej: Café en Starbucks"
                  />
                </div>

                <div className="form-group">
                  <label>Comercio</label>
                  <input
                    type="text"
                    name="merchant"
                    value={form.merchant}
                    onChange={handleInputChange}
                    placeholder="ej: Starbucks"
                  />
                </div>

                <div className="form-group">
                  <label>Fecha *</label>
                  <input
                    type="date"
                    name="date"
                    value={form.date}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Agregando...' : '➕ Agregar Gasto'}
                </button>
              </form>
            </div>

            {expenses.length > 0 && (
              <div className="expenses-list-card">
                <h3>📋 Últimos gastos</h3>
                <div className="expenses-list">
                  {expenses.slice().reverse().map(expense => (
                    <div key={expense.id} className="expense-item">
                      <div className="expense-info">
                        <div className="expense-category">{expense.category}</div>
                        <div className="expense-desc">{expense.description || expense.merchant || 'Sin descripción'}</div>
                        <div className="expense-date">{new Date(expense.date).toLocaleDateString()}</div>
                      </div>
                      <div className="expense-amount">€{expense.amount.toFixed(2)}</div>
                      <button className="btn-delete" onClick={() => handleDeleteExpense(expense.id)}>🗑️</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="section">
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Total gastado</h3>
                <p className="stat-value">€{totalSpent.toFixed(2)}</p>
              </div>
              <div className="stat-card">
                <h3>Transacciones</h3>
                <p className="stat-value">{expenses.length}</p>
              </div>
              <div className="stat-card">
                <h3>Promedio</h3>
                <p className="stat-value">€{expenses.length > 0 ? (totalSpent / expenses.length).toFixed(2) : '0.00'}</p>
              </div>
              <div className="stat-card">
                <h3>Categorías</h3>
                <p className="stat-value">{summary.length}</p>
              </div>
            </div>

            {summary.length > 0 ? (
              <>
                <div className="chart-container">
                  <h3>Gastos por categoría (Gráfico de pastel)</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={summary}
                        dataKey="total_spent"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label
                      >
                        {summary.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `€${value.toFixed(2)}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-container">
                  <h3>Comparativa por categoría (Gráfico de barras)</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={summary}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="category" />
                      <YAxis />
                      <Tooltip formatter={(value) => `€${value.toFixed(2)}`} />
                      <Legend />
                      <Bar dataKey="total_spent" fill="#667eea" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <p>Sin gastos registrados. ¡Agrega tu primer gasto!</p>
              </div>
            )}
          </div>
        )}

        {/* TAB: ANÁLISIS */}
        {activeTab === 'analysis' && (
          <div className="section">
            <div className="analysis-header">
              <h2>Análisis Inteligente</h2>
              <button 
                className="btn btn-primary" 
                onClick={handleAnalyze}
                disabled={loading || expenses.length === 0}
              >
                {loading ? '⏳ Analizando...' : '🤖 Analizar Gastos'}
              </button>
            </div>

            {expenses.length === 0 && !analysis && (
              <div className="empty-state">
                <p>Necesitas gastos registrados para análisis. ¡Agrega algunos!</p>
              </div>
            )}

            {analysis && (
              <div className="analysis-card">
                <h3>📊 Análisis de gastos</h3>
                <p>{analysis.analysis}</p>
              </div>
            )}

            {predictions && (
              <div className="analysis-card">
                <h3>🔮 Predicciones</h3>
                <p>{predictions.prediction}</p>
              </div>
            )}

            {recommendations && (
              <div className="analysis-card">
                <h3>💡 Recomendaciones</h3>
                <p>{recommendations.recommendation}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="footer">
        <p>💰 Spend Tracker AI • Powered by Claude & Tink • 2026</p>
      </footer>
    </div>
  );
}

export default App;