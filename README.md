# 💰 Spend Tracker AI

Un aplicación de seguimiento de gastos inteligente con análisis automático usando Claude AI.

## 🚀 Características

- ✅ Categorización automática de gastos con IA
- 📊 Análisis inteligente de patrones de gasto
- 🔮 Predicciones de gasto futuro
- 💡 Recomendaciones personalizadas para ahorrar
- 📈 Gráficos y resúmenes mensuales
- 🏦 Preparado para integración bancaria (Plaid/Yapily)
- 💾 Base de datos local SQLite

## 📋 Requisitos

- Node.js 18+
- npm o yarn
- Clave API de Anthropic (Claude)

## 🔧 Instalación

### 1. Clonar/Descargar el proyecto
```bash
cd spend-tracker-ai
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
Crea un archivo `.env` en la raíz:
```
PORT=5000
ANTHROPIC_API_KEY=tu_clave_api_aqui
NODE_ENV=development
```

**Obtener API Key:**
1. Ve a https://console.anthropic.com
2. Crea una cuenta o inicia sesión
3. En el dashboard, ve a "API Keys"
4. Crea una nueva clave y cópiala
5. Pégala en `.env`

### 4. Iniciar el servidor
```bash
npm start
```

El servidor estará disponible en `http://localhost:5000`

## 📡 API Endpoints

### Gastos

**GET /api/expenses**
- Obtener todos los gastos
- Parámetros: `category`, `month`, `year`

**POST /api/expenses**
- Crear nuevo gasto
- Body:
```json
{
  "amount": 25.50,
  "description": "Café en Starbucks",
  "date": "2024-01-15",
  "merchant": "Starbucks",
  "payment_method": "credit_card"
}
```

**GET /api/expenses/:id**
- Obtener gasto específico

**PUT /api/expenses/:id**
- Actualizar gasto

**DELETE /api/expenses/:id**
- Eliminar gasto

### Resúmenes

**GET /api/expenses/summary**
- Resumen por categoría

**GET /api/analysis/monthly-summary?month=01&year=2024**
- Resumen mensual completo

**GET /api/analysis/month-comparison**
- Comparativa mes a mes

### Análisis Inteligente

**GET /api/analysis/spending-analysis**
- Análisis completo de gastos con patrones

**GET /api/analysis/predictions**
- Predicciones de gasto futuro

**GET /api/analysis/recommendations**
- Recomendaciones personalizadas para ahorrar

## 💻 Ejemplo de uso

```bash
# Crear un gasto
curl -X POST http://localhost:5000/api/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 45.00,
    "description": "Gasolina Repsol",
    "date": "2024-01-15",
    "merchant": "Repsol"
  }'

# Obtener análisis
curl http://localhost:5000/api/analysis/spending-analysis?month=01&year=2024

# Obtener predicciones
curl http://localhost:5000/api/analysis/predictions

# Obtener recomendaciones
curl http://localhost:5000/api/analysis/recommendations
```

## 🔗 Próximos pasos - Integración Bancaria

Para conectar con tu banco, necesitarás integrar Plaid o Yapily:

### Opción 1: Plaid (Recomendado)
```bash
npm install plaid
```
- Soporta 12,000+ instituciones
- Muy seguro
- Documentación completa

### Opción 2: Yapily
```bash
npm install yapily
```
- API abierta europea (PSD2)
- Buena para bancos españoles

Te ayudaré con esta integración cuando estés listo.

## 📁 Estructura del proyecto

```
spend-tracker-ai/
├── db/
│   └── database.js         # Configuración SQLite
├── routes/
│   ├── expenses.js         # API de gastos
│   └── analysis.js         # API de análisis
├── services/
│   └── claude.js           # Integración Claude AI
├── server.js               # Servidor Express
├── package.json
├── .env                    # Variables de entorno
└── README.md
```

## 🐛 Troubleshooting

**"ANTHROPIC_API_KEY no encontrada"**
- Verifica que has puesto la clave en `.env`
- Reinicia el servidor después de cambiar `.env`

**"Error de base de datos"**
- Elimina `db/spending.db` y reinicia
- Se recreará automáticamente

**"Puerto 5000 en uso"**
- Cambia `PORT` en `.env` a otro número
- O mata el proceso: `lsof -i :5000` y `kill -9 <PID>`

## 📞 Soporte

Para problemas o preguntas sobre la API de Claude, visita:
- https://docs.anthropic.com
- https://console.anthropic.com

## 📄 Licencia

MIT
