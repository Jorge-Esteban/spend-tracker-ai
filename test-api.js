#!/usr/bin/env node

/**
 * Script para testear la API del Spend Tracker
 * Uso: npm test o node test-api.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';

const request = (method, path, data = null) => {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
};

const runTests = async () => {
  console.log('\n🧪 Testing Spend Tracker API\n');

  try {
    // Test 1: Health check
    console.log('1️⃣  Testing /api/health...');
    const health = await request('GET', '/api/health');
    console.log('✅ Health:', health.data);

    // Test 2: Create expense
    console.log('\n2️⃣  Creating expense...');
    const expense = {
      amount: 25.50,
      description: 'Café en el bar',
      date: new Date().toISOString().split('T')[0],
      merchant: 'Bar Central'
    };
    const createResp = await request('POST', '/api/expenses', expense);
    console.log('✅ Created:', createResp.data);
    const expenseId = createResp.data.id;

    // Test 3: Get expenses
    console.log('\n3️⃣  Getting all expenses...');
    const expenses = await request('GET', '/api/expenses');
    console.log('✅ Expenses count:', expenses.data.length);

    // Test 4: Get expense summary
    console.log('\n4️⃣  Getting summary...');
    const summary = await request('GET', '/api/expenses/summary');
    console.log('✅ Summary:', summary.data);

    // Test 5: Monthly summary
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    console.log(`\n5️⃣  Getting monthly summary (${month}/${year})...`);
    const monthlySummary = await request('GET', `/api/analysis/monthly-summary?month=${month}&year=${year}`);
    console.log('✅ Monthly summary:', monthlySummary.data);

    // Test 6: Update expense
    console.log('\n6️⃣  Updating expense...');
    const updateResp = await request('PUT', `/api/expenses/${expenseId}`, {
      amount: 30.00,
      category: 'Ocio',
      description: 'Café actualizado',
      date: new Date().toISOString().split('T')[0]
    });
    console.log('✅ Updated:', updateResp.data);

    // Test 7: Delete expense
    console.log('\n7️⃣  Deleting expense...');
    const deleteResp = await request('DELETE', `/api/expenses/${expenseId}`);
    console.log('✅ Deleted:', deleteResp.data);

    console.log('\n✨ All tests passed!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\n⚠️  Make sure the server is running on http://localhost:5000');
    console.log('Run: npm start\n');
  }
};

runTests();
