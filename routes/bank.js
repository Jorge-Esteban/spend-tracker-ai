const express = require('express');
const axios = require('axios');
const { categorizeExpense } = require('../services/claude');

const router = express.Router();

// Credenciales de Tink
const TINK_CLIENT_ID = '472eb2de5ae54713aa591595e043d467';
const TINK_CLIENT_SECRET = '<REDACTED_TINK_SECRET>';
const TINK_BASE_URL = 'https://api.tink.com';

/**
 * Intercambiar código de autorización por token
 */
async function getAccessToken(authCode) {
  try {
    console.log('📤 Intercambiando código por token...');
    console.log('Code:', authCode.substring(0, 20) + '...');

    // Usar form-data en lugar de JSON
    const response = await axios.post(
      `${TINK_BASE_URL}/api/v1/oauth/token`,
      {
        code: authCode,
        client_id: TINK_CLIENT_ID,
        client_secret: TINK_CLIENT_SECRET,
        grant_type: 'authorization_code'
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    console.log('✅ Token obtenido:', response.data.access_token.substring(0, 20) + '...');
    return response.data.access_token;
  } catch (error) {
    console.error('❌ Error intercambiando token:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Message:', error.message);
    throw new Error(`Error de autenticación Tink: ${error.response?.data?.errorMessage || error.message}`);
  }
}

/**
 * Obtener transacciones de Tink
 */
async function getTinkTransactions(accessToken) {
  try {
    console.log('🏦 Obteniendo cuentas...');

    // Obtener cuentas
    const accountsResponse = await axios.get(`${TINK_BASE_URL}/data/v2/accounts`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const accounts = accountsResponse.data.accounts || [];
    console.log(`✅ ${accounts.length} cuenta(s) encontrada(s)`);

    if (accounts.length === 0) {
      return [];
    }

    // Obtener transacciones de cada cuenta
    let allTransactions = [];
    for (const account of accounts) {
      try {
        console.log(`📊 Obteniendo transacciones de ${account.name}...`);

        const transResponse = await axios.get(
          `${TINK_BASE_URL}/data/v2/transactions`,
          {
            params: {
              accountId: account.id,
              limit: 100
            },
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        );

        const transactions = transResponse.data.transactions || [];
        console.log(`  → ${transactions.length} transacciones obtenidas`);
        allTransactions = allTransactions.concat(transactions);
      } catch (error) {
        console.error(`⚠️ Error en cuenta ${account.id}:`, error.message);
      }
    }

    return allTransactions;
  } catch (error) {
    console.error('❌ Error obteniendo transacciones:', error.message);
    throw new Error('No se pudo obtener las transacciones de Tink');
  }
}

/**
 * Endpoint: POST /api/bank/import
 * Importar transacciones desde Tink
 */
router.post('/import', async (req, res) => {
  try {
    const prisma = req.prisma;
    const { authCode } = req.body;

    if (!authCode) {
      console.error('❌ authCode no recibido en el request');
      return res.status(400).json({ error: 'Código de autorización requerido' });
    }

    console.log('\n\n========================================');
    console.log('🔄 INICIANDO IMPORTACIÓN DE TRANSACCIONES');
    console.log('========================================\n');

    // 1. Obtener token de acceso
    const accessToken = await getAccessToken(authCode);

    // 2. Obtener transacciones de Tink
    const tinkTransactions = await getTinkTransactions(accessToken);

    if (tinkTransactions.length === 0) {
      console.log('⚠️ No se encontraron transacciones');
      return res.json({
        importedCount: 0,
        skippedCount: 0,
        totalProcessed: 0,
        message: 'No se encontraron transacciones'
      });
    }

    console.log(`\n✅ Total: ${tinkTransactions.length} transacciones para procesar\n`);

    // 3. Procesar y guardar transacciones
    let importedCount = 0;
    let skippedCount = 0;

    for (const transaction of tinkTransactions) {
      try {
        // Saltamos transacciones muy antiguas o sin descripción
        if (!transaction.description) {
          skippedCount++;
          continue;
        }

        // Verificar si ya existe (solo por descripción y fecha)
        const existing = await prisma.expense.findFirst({
          where: {
            description: transaction.description,
            date: {
              gte: new Date(new Date(transaction.date).setHours(0, 0, 0, 0)),
              lt: new Date(new Date(transaction.date).setHours(23, 59, 59, 999))
            }
          }
        });

        if (existing) {
          skippedCount++;
          console.log(`⏭️  Ya existe: ${transaction.description}`);
          continue;
        }

        // Solo importar gastos (amount negativo = dinero saliendo)
        if (transaction.amount >= 0) {
          skippedCount++;
          continue;
        }

        // Clasificar con Claude
        const category = await categorizeExpense({
          amount: Math.abs(transaction.amount),
          description: transaction.description,
          merchant: transaction.description
        });

        // Guardar en BD
        await prisma.expense.create({
          data: {
            amount: Math.abs(transaction.amount),
            description: transaction.description,
            merchant: transaction.description,
            date: new Date(transaction.date),
            category
          }
        });

        importedCount++;
        console.log(`✅ ${transaction.description} → ${category} (€${Math.abs(transaction.amount).toFixed(2)})`);
      } catch (error) {
        console.error(`⚠️ Error procesando: ${transaction.description}`, error.message);
        skippedCount++;
      }
    }

    console.log(`\n========================================`);
    console.log(`📊 RESULTADO: ${importedCount} importadas, ${skippedCount} omitidas`);
    console.log(`========================================\n`);

    res.json({
      importedCount,
      skippedCount,
      totalProcessed: tinkTransactions.length,
      message: `${importedCount} transacciones importadas exitosamente`
    });
  } catch (error) {
    console.error('❌ Error en /bank/import:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Endpoint: GET /api/bank/status
 * Verificar estado de conexión
 */
router.get('/status', (req, res) => {
  res.json({
    status: 'connected',
    provider: 'Tink',
    message: 'Sistema de importación de banco listo'
  });
});

module.exports = router;
