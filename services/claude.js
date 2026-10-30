const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const CATEGORIES = ['Comida', 'Transporte', 'Ocio', 'Salud', 'Compras', 'Servicios', 'Otros'];

/**
 * Categoriza automáticamente un gasto usando Claude
 */
const categorizeExpense = async (expense) => {
  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: `Categoriza este gasto en una de estas categorías: ${CATEGORIES.join(', ')}.
          
Descripción: ${expense.description}
Cantidad: €${expense.amount}

Responde SOLO con el nombre de la categoría, sin explicación.`
        }
      ]
    });

    const category = message.content[0].text.trim();
    return CATEGORIES.includes(category) ? category : 'Otros';
  } catch (error) {
    console.error('Error categorizing:', error);
    return 'Otros';
  }
};

/**
 * Analiza patrones de gastos
 */
const analyzeSpending = async (expenses) => {
  if (!expenses || expenses.length === 0) {
    return { error: 'No expenses to analyze' };
  }

  try {
    // Preparar resumen de datos
    const summary = {
      total_expenses: expenses.length,
      total_amount: expenses.reduce((sum, e) => sum + e.amount, 0),
      by_category: {},
      average_per_transaction: 0
    };

    // Agrupar por categoría
    expenses.forEach(exp => {
      if (!summary.by_category[exp.category]) {
        summary.by_category[exp.category] = { count: 0, total: 0 };
      }
      summary.by_category[exp.category].count++;
      summary.by_category[exp.category].total += exp.amount;
    });

    summary.average_per_transaction = summary.total_amount / expenses.length;

    // Llamar a Claude para análisis
    const message = await client.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Analiza estos gastos y proporciona insights:

Datos de gastos:
${JSON.stringify(summary, null, 2)}

Por favor proporciona:
1. Los 3 patrones de gasto más importantes
2. Áreas de preocupación
3. Oportunidades de ahorro

Responde en formato JSON con keys: patterns, concerns, savings_opportunities`
        }
      ]
    });

    const analysisText = message.content[0].text;
    
    // Intentar parsear como JSON, si falla devolver como texto
    try {
      return JSON.parse(analysisText);
    } catch {
      return {
        summary,
        analysis: analysisText
      };
    }
  } catch (error) {
    console.error('Error analyzing spending:', error);
    return { error: error.message };
  }
};

/**
 * Predice gastos futuros basado en histórico
 */
const getPredictions = async (expenses) => {
  if (!expenses || expenses.length === 0) {
    return { error: 'No expenses to predict' };
  }

  try {
    // Calcular tendencias
    const byMonth = {};
    expenses.forEach(exp => {
      const month = exp.date.substring(0, 7); // YYYY-MM
      if (!byMonth[month]) {
        byMonth[month] = 0;
      }
      byMonth[month] += exp.amount;
    });

    const message = await client.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `Basándote en este histórico de gastos mensuales, predice el gasto del próximo mes:

Gastos por mes: ${JSON.stringify(byMonth)}

Proporciona:
1. Predicción de gasto total para el próximo mes
2. Confianza de la predicción (alto/medio/bajo)
3. Factores que pueden afectar
4. Recomendación de presupuesto

Responde en JSON con keys: predicted_amount, confidence, factors, budget_recommendation`
        }
      ]
    });

    const predictionText = message.content[0].text;
    
    try {
      return JSON.parse(predictionText);
    } catch {
      return {
        historical_monthly_spending: byMonth,
        prediction: predictionText
      };
    }
  } catch (error) {
    console.error('Error predicting:', error);
    return { error: error.message };
  }
};

/**
 * Genera recomendaciones personalizadas
 */
const getRecommendations = async (expenses) => {
  if (!expenses || expenses.length === 0) {
    return { error: 'No expenses for recommendations' };
  }

  try {
    // Identificar categorías principales
    const byCat = {};
    expenses.forEach(exp => {
      byCat[exp.category] = (byCat[exp.category] || 0) + exp.amount;
    });

    const topCategories = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const message = await client.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Basándote en estos patrones de gasto, da recomendaciones personalizadas para ahorrar dinero:

Categorías principales de gasto:
${topCategories.map(([cat, amount]) => `- ${cat}: €${amount.toFixed(2)}`).join('\n')}

Total de gastos analizados: ${expenses.length}
Promedio por transacción: €${(expenses.reduce((s, e) => s + e.amount, 0) / expenses.length).toFixed(2)}

Proporciona 3-4 recomendaciones específicas y actionables para reducir gastos en estas categorías.
Responde en JSON con key: recommendations (array de strings)`
        }
      ]
    });

    const recommendationsText = message.content[0].text;
    
    try {
      return JSON.parse(recommendationsText);
    } catch {
      return {
        top_categories: topCategories,
        recommendations: recommendationsText
      };
    }
  } catch (error) {
    console.error('Error generating recommendations:', error);
    return { error: error.message };
  }
};

module.exports = {
  categorizeExpense,
  analyzeSpending,
  getPredictions,
  getRecommendations
};
