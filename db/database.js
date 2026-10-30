const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'spending.db');
let db;

const initDB = () => {
  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error abriendo DB:', err);
    } else {
      console.log('✅ Base de datos conectada');
      createTables();
    }
  });
};

const createTables = () => {
  db.serialize(() => {
    // Tabla de gastos
    db.run(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        date TEXT NOT NULL,
        merchant TEXT,
        payment_method TEXT,
        is_recurring INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de categorías
    db.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        color TEXT,
        icon TEXT,
        budget_limit REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de análisis
    db.run(`
      CREATE TABLE IF NOT EXISTS analysis_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        analysis_type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT
      )
    `);

    // Insertar categorías por defecto
    const defaultCategories = [
      { name: 'Comida', color: '#FF6B6B', icon: '🍽️' },
      { name: 'Transporte', color: '#4ECDC4', icon: '🚗' },
      { name: 'Ocio', color: '#45B7D1', icon: '🎬' },
      { name: 'Salud', color: '#FFA07A', icon: '🏥' },
      { name: 'Compras', color: '#98D8C8', icon: '🛍️' },
      { name: 'Servicios', color: '#F7DC6F', icon: '⚙️' },
      { name: 'Otros', color: '#BDC3C7', icon: '📌' }
    ];

    defaultCategories.forEach(cat => {
      db.run(
        `INSERT OR IGNORE INTO categories (name, color, icon) VALUES (?, ?, ?)`,
        [cat.name, cat.color, cat.icon]
      );
    });
  });
};

const getDB = () => db;

module.exports = {
  initDB,
  getDB
};
