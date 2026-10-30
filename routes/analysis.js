const express = require('express');
const { analyzeSpending, predictSpending, recommendSavings } = require('../services/claude');

const router = express.Router();

// GET análisis de gastos
router.get('/spending-analysis', async (req, res) => {
  try {
    const prisma = req.prisma;

    // Obtener todos los gastos
    const expenses = await prisma.expense.findMany({
      orderBy: { date: 'desc' }
    });

    if (expenses.length === 0) {
      return res.json({ analysis: 'No hay datos suficientes para analizar' });
    }

    // Calcular estadísticas
    const totalSpent = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const avgExpense = totalSpent / expenses.length;
    const maxExpense = Math.max(...expenses.map(exp => exp.amount));
    const minExpense = Math.min(...expenses.map(exp => exp.amount));

    // Agrupar por categoría
    const byCategory = expenses.reduce((acc, exp) => {
      const existing = acc.find(item => item.category === exp.category);
      if (existing) {
        existing.total += exp.amount;
        existing.count += 1;
      } else {
        acc.push({
          category: exp.category,
          total: exp.amount,
          count: 1
        });
      }
      return acc;
    }, []);

    const analysisText = `
Análisis de gastos:
- Total gastado: €${totalSpent.toFixed(2)}
- Promedio por transacción: €${avgExpense.toFixed(2)}
- Gasto máximo: €${maxExpense.toFixed(2)}
- Gasto mínimo: €${minExpense.toFixed(2)}
- Total de transacciones: ${expenses.length}

Por categoría:
${byCategory.map(cat => `- ${cat.category}: €${cat.total.toFixed(2)} (${cat.count} transacciones)`).join('\n')}
    `;

    // Usar Claude para análisis más profundo
    const analysis = await analyzeSpending(analysisText);

    // Guardar en caché
    await prisma.analysisCache.create({
      data: {
        analysisType: 'spending-analysis',
        data: analysis,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    res.json({ analysis });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET predicciones
router.get('/predictions', async (req, res) => {
  try {
    const prisma = req.prisma;

    // Obtener gastos del último mes
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const recentExpenses = await prisma.expense.findMany({
      where: {
        date: {
          gte: oneMonthAgo
        }
      },
      orderBy: { date: 'desc' }
    });

    if (recentExpenses.length === 0) {
      return res.json({ prediction: 'Datos insuficientes para predicciones' });
    }

    const avgMonthly = recentExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const predictionText = `
Basado en los gastos del último mes:
- Gasto promedio mensual: €${avgMonthly.toFixed(2)}
- Total de transacciones: ${recentExpenses.length}
- Proyección para los próximos 3 meses: €${(avgMonthly * 3).toFixed(2)}
    `;

    const prediction = await predictSpending(predictionText);

    // Guardar en caché
    await prisma.analysisCache.create({
      data: {
        analysisType: 'predictions',
        data: prediction,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    res.json({ prediction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET recomendaciones
router.get('/recommendations', async (req, res) => {
  try {
    const prisma = req.prisma;

    // Obtener todos los gastos
    const expenses = await prisma.expense.findMany();

    if (expenses.length === 0) {
      return res.json({ recommendation: 'Comienza a registrar gastos para obtener recomendaciones' });
    }

    // Agrupar por categoría y calcular promedios
    const byCategory = expenses.reduce((acc, exp) => {
      const existing = acc.find(item => item.category === exp.category);
      if (existing) {
        existing.total += exp.amount;
        existing.count += 1;
      } else {
        acc.push({
          category: exp.category,
          total: exp.amount,
          count: 1
        });
      }
      return acc;
    }, []);

    const topCategories = byCategory
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
      .map(cat => `${cat.category}: €${cat.total.toFixed(2)}`);

    const recommendationText = `
Basado en tus patrones de gasto:
- Categorías principales: ${topCategories.join(', ')}
- Total de categorías: ${byCategory.length}
- Total de transacciones: ${expenses.length}

Proporciona recomendaciones personalizadas para ahorrar dinero.
    `;

    const recommendation = await recommendSavings(recommendationText);

    // Guardar en caché
    await prisma.analysisCache.create({
      data: {
        analysisType: 'recommendations',
        data: recommendation,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    res.json({ recommendation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
