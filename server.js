const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const expenseRoutes = require('./routes/expenses');
const analysisRoutes = require('./routes/analysis');
const bankRoutes = require('./routes/bank');

const app = express();
const PORT = process.env.PORT || 5000;
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Hacer prisma disponible en las rutas
app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

// Rutas
app.use('/api/expenses', expenseRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/bank', bankRoutes);

// Ruta de prueba
app.get('/api/health', (req, res) => {
  res.json({ status: 'API running', timestamp: new Date() });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📊 Spend Tracker AI con MongoDB iniciado\n`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = app;
