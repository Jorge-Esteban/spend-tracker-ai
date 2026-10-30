const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { categorizeExpense } = require('../services/claude');

const router = express.Router();

// GET todos los gastos
router.get('/', async (req, res) => {
  try {
    const { category, month, year } = req.query;
    const prisma = req.prisma;

    const where = {};

    if (category) {
      where.category = category;
    }

    if (month && year) {
      const startDate = new Date(year, parseInt(month) - 1, 1);
      const endDate = new Date(year, parseInt(month), 0, 23, 59, 59);
      where.date = {
        gte: startDate,
        lte: endDate
      };
    }

    const expenses = await prisma.expense.findMany({
      where,
      orderBy: { date: 'desc' }
    });

    res.json(expenses || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET gastos por categoría con resumen
router.get('/summary', async (req, res) => {
  try {
    const prisma = req.prisma;
    const { month, year } = req.query;

    const where = {};
    if (month && year) {
      const startDate = new Date(year, parseInt(month) - 1, 1);
      const endDate = new Date(year, parseInt(month), 0, 23, 59, 59);
      where.date = {
        gte: startDate,
        lte: endDate
      };
    }

    const expenses = await prisma.expense.findMany({ where });

    // Agrupar por categoría
    const summary = expenses.reduce((acc, expense) => {
      const existing = acc.find(item => item.category === expense.category);
      if (existing) {
        existing.total_spent += expense.amount;
        existing.count += 1;
      } else {
        acc.push({
          category: expense.category,
          total_spent: expense.amount,
          count: 1
        });
      }
      return acc;
    }, []);

    // Ordenar por total gastado
    summary.sort((a, b) => b.total_spent - a.total_spent);

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET un gasto específico
router.get('/:id', async (req, res) => {
  try {
    const prisma = req.prisma;
    const expense = await prisma.expense.findUnique({
      where: { id: req.params.id }
    });

    if (!expense) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    res.json(expense);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST crear nuevo gasto
router.post('/', async (req, res) => {
  try {
    const prisma = req.prisma;
    const { amount, description, date, merchant, payment_method } = req.body;

    if (!amount || !date) {
      return res.status(400).json({ error: 'Amount y date son requeridos' });
    }

    // Categorizar automáticamente con Claude
    const category = await categorizeExpense({
      description: description || merchant || 'Sin descripción',
      amount
    });

    const expense = await prisma.expense.create({
      data: {
        amount: parseFloat(amount),
        category,
        description: description || null,
        merchant: merchant || null,
        date: new Date(date),
        paymentMethod: payment_method || null
      }
    });

    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ error: 'Error creando gasto: ' + error.message });
  }
});

// PUT actualizar gasto
router.put('/:id', async (req, res) => {
  try {
    const prisma = req.prisma;
    const { amount, category, description, date, merchant, payment_method } = req.body;

    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: {
        amount: amount ? parseFloat(amount) : undefined,
        category,
        description,
        date: date ? new Date(date) : undefined,
        merchant,
        paymentMethod: payment_method
      }
    });

    res.json(expense);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE gasto
router.delete('/:id', async (req, res) => {
  try {
    const prisma = req.prisma;
    await prisma.expense.delete({
      where: { id: req.params.id }
    });

    res.json({ deleted: true });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
