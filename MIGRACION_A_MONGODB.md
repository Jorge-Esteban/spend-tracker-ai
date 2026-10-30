# 🚀 Migración a MongoDB - Spend Tracker AI

## ¿Qué ha cambiado?

Tu app ahora usa:
- ✅ **MongoDB** (base de datos en la nube)
- ✅ **Prisma ORM** (más portable y flexible)
- ✅ **Variables de entorno** (.env)

## 📋 Pasos para migrar

### **PASO 1: Reemplazar archivos**

Reemplaza estos archivos en tu carpeta `spend-tracker-ai`:

```
✅ .env                          (NUEVO - con tu connection string)
✅ schema.prisma                 (NUEVO - estructura de BD)
✅ package.json                  (ACTUALIZADO - con Prisma)
✅ server.js → server-mongo.js   (RENOMBRA)
✅ routes/expenses.js → expenses-mongo.js
✅ routes/bank.js → bank-mongo.js
✅ routes/analysis.js → analysis-mongo.js
```

### **PASO 2: Eliminar SQLite**

Borra estos archivos (ya no los necesitas):
```
❌ db/database.js     (SQLite)
❌ db/spending.db     (Base de datos local)
```

### **PASO 3: Instalar dependencias**

En tu terminal:
```bash
cd spend-tracker-ai
npm install
```

Esto instalará:
- `@prisma/client` (cliente de Prisma)
- `prisma` (CLI de Prisma)
- Los demás paquetes necesarios

### **PASO 4: Generar Prisma Client**

```bash
npx prisma generate
```

### **PASO 5: Iniciar servidor**

```bash
npm start
```

Deberías ver:
```
🚀 Servidor corriendo en http://localhost:5000
📊 Spend Tracker AI con MongoDB iniciado
```

---

## 📁 Estructura de carpetas esperada

```
spend-tracker-ai/
├── .env                    ← NUEVO (con CONNECTION_STRING)
├── schema.prisma           ← NUEVO (estructura Prisma)
├── package.json            ← ACTUALIZADO
├── server.js (o server-mongo.js renombrado a server.js)
├── db/
│   └── (vacío - ya no hay database.js)
├── routes/
│   ├── expenses.js (actualizado)
│   ├── analysis.js (actualizado)
│   └── bank.js (actualizado)
├── services/
│   └── claude.js (sin cambios)
├── client/
│   └── (sin cambios)
└── node_modules/
    └── (después de npm install)
```

---

## 🔗 Variables en .env

Tu `.env` debe contener:
```
DATABASE_URL="mongodb+srv://<user>:<REDACTED>@<cluster>/<db>"
PORT=5000
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

---

## ✅ Verificación

Una vez iniciado el servidor:

1. **Prueba el health check:**
   ```
   GET http://localhost:5000/api/health
   ```

2. **Crea un gasto:**
   ```bash
   POST http://localhost:5000/api/expenses
   Body: {
     "amount": 25.50,
     "description": "Café",
     "date": "2026-09-27",
     "merchant": "Starbucks"
   }
   ```

3. **Obtén todos los gastos:**
   ```
   GET http://localhost:5000/api/expenses
   ```

---

## 🆘 Si algo falla

### Error: "Module not found"
```bash
rm -rf node_modules package-lock.json
npm install
```

### Error: "ECONNREFUSED" (MongoDB)
- Verifica tu connection string en `.env`
- Asegúrate de que el cluster en MongoDB Atlas está activo
- Verifica que tu IP está en la whitelist de MongoDB

### Error: "Schema mismatch"
```bash
npx prisma generate
```

---

## 🎉 ¡Listo!

Tu app está ahora en MongoDB y funciona autónomamente. El frontend (React) se conecta igual que antes.

**Próximos pasos:**
- ✅ Iniciar frontend: `cd client && npm start`
- ✅ Conectar banco: "Conectar Imagin"
- ✅ Importar transacciones: "Importar Transacciones"
