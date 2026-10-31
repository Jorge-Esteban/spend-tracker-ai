# 💶 Spend Tracker AI · v2

Control de **gastos e ingresos** personal y **multiusuario** con categorización automática e informes generados por **Claude**, presupuestos por categoría e importación bancaria por **Tink** (open banking).

> Proyecto de portfolio (Business Analyst / desarrollo full-stack + IA). La v2 es una reescritura completa de la v1 tras una auditoría: ver [docs/AUDITORIA.md](docs/AUDITORIA.md).

## Qué hace

- **Cuentas de usuario** con sesión en cookie httpOnly. Cada usuario solo ve sus datos.
- **Movimientos de gasto e ingreso** con búsqueda, filtro por tipo y por mes, paginación y **exportación CSV** (lista para Excel en español).
- **Categorización automática** en tres pasos: regla aprendida del comercio → Claude (en lote, por tipo) → categoría de reserva («Otros» u «Otros ingresos»). Si corriges una categoría, la app crea una regla y no vuelve a preguntar a la IA por ese comercio.
- **Categorías propias** de gasto o de ingreso, con color e icono; las de gasto admiten **presupuesto mensual**. Estado del presupuesto: correcto, alerta (≥ 80 %) o superado.
- **Resumen** con ingresos, gastos y **balance** del mes, comparación con el mes anterior, tendencia de 12 meses (ingresos y gastos) y reparto por categoría.
- **Análisis con IA**: una sola llamada por usuario, cacheada 24 h. FREE recibe resumen, patrones y alertas; PRO además predicción del mes siguiente y recomendaciones de ahorro.
- **Importación bancaria con Tink** (de momento solo con Demo Bank): cargos como gastos y abonos como ingresos, con deduplicación por id de transacción.
- **Planes FREE / PRO**: FREE tiene un tope de 50 movimientos al mes. Ver [docs/MONETIZACION.md](docs/MONETIZACION.md).
- Tema **claro / oscuro** que recuerda tu elección.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js (ESM), Express 5, Prisma 6.19 (MongoDB Atlas), Zod 4, pino, helmet, express-rate-limit |
| IA | `@anthropic-ai/sdk` con salidas estructuradas (Zod) · modelos configurables por variable de entorno |
| Banco | Tink Link + API Data v2 |
| Frontend | Vite + React 19 + Recharts, CSS con variables |
| Tests | Vitest + supertest + mongodb-memory-server (replica set) |
| Despliegue | Railway (API) + Vercel (frontend, proxy `/api`) — ver [docs/DEPLOY.md](docs/DEPLOY.md) |

> **¿Por qué Prisma 6 y no 7?** Prisma 7 todavía no soporta MongoDB; la versión está fijada a `~6.19.3`.

## Arquitectura

```
src/
├── app.js               createApp(): middlewares + rutas (sin listen, para tests)
├── server.js            arranque y apagado limpio
├── config/env.js        variables de entorno validadas con Zod
├── lib/                 prisma, logger, errores, dinero (céntimos), fechas (UTC)
├── middleware/          auth (JWT en cookie), errores, rate limits, validación de ids
└── modules/
    ├── auth/            registro, login, logout, me
    ├── categories/      CRUD; borrar reasigna a «Otros»
    ├── expenses/        CRUD, listado, CSV
    ├── stats/           agregaciones puras + /api/stats
    ├── ai/              cliente Claude, categorización, insights con caché
    ├── bank/            Tink: cliente, parser v2 puro, state firmado, importación
    └── usage/           cuotas por plan
client/                  Vite + React (auth, gastos, resumen, presupuestos, análisis, banco, categorías)
prisma/schema.prisma     modelos MongoDB
scripts/claim-orphans.js migración de los datos de la v1
tests/                   unitarios + integración
```

Principios: **todo el dinero en céntimos enteros**, **toda consulta filtrada por `userId`**, el cliente **nunca** ve mensajes de error internos y **los secretos solo viven en `.env`**.

## Puesta en marcha local

Requisitos: Node.js **22 LTS** recomendado (funciona desde 20.11), una base de datos MongoDB (Atlas sirve) y, opcionalmente, claves de Anthropic y Tink.

```bash
npm install
npm --prefix client install
cp .env.example .env        # rellena DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY...
```

Crea los índices en tu base de datos (esto **escribe** en la base de datos de `DATABASE_URL`; si vienes de la v1 lee antes la sección de migración):

```bash
npx prisma db push
```

Arranca API y frontend en dos terminales:

```bash
npm run dev
```

```bash
npm run client:dev
```

Abre http://localhost:5173. Vite redirige `/api` a `http://localhost:5000`, así que el navegador trabaja siempre en el mismo origen.

¿Quieres probarla sin tocar Atlas? `npm run dev:memory` arranca la API contra un MongoDB en memoria (se borra al parar) en lugar de `npm run dev`.

Sin `ANTHROPIC_API_KEY` la app funciona igual: los gastos sin categoría van a «Otros» y el análisis IA responde que no está configurado. Sin las variables `TINK_*` la pestaña Banco lo indica.

### Migrar datos de la v1

Los gastos de la v1 no tenían usuario. El script es un simulacro salvo que pases `--apply`:

```bash
node scripts/claim-orphans.js
```

1. `node scripts/claim-orphans.js --apply` → guarda una copia JSON de los datos antiguos en `backups/` y elimina el índice único antiguo por nombre de categoría (impediría que dos usuarios tengan su propia «Comida»). No borra documentos.
2. `npx prisma db push`
3. Regístrate en la app.
4. `node scripts/claim-orphans.js --email tu@email.com --apply` → asigna los gastos y categorías antiguos a tu usuario, pasa los importes a céntimos y conserva los presupuestos. Los gastos con importe inválido se dejan intactos y se listan.

## Tests

```bash
npm test
```

- **Unitarios**: dinero y fechas, agregaciones y presupuestos, CSV, parser y cliente de Tink, esquemas Zod, entorno, normalización de comercios.
- **Integración** (API real contra MongoDB en memoria, Claude y Tink simulados): auth, aislamiento entre usuarios, validación, categorías, estadísticas, cuota FREE, caché de insights e importación bancaria.

La primera ejecución descarga un binario de MongoDB (unos 800 MB en Windows, casi todo símbolos de depuración). Nunca se toca tu base de datos real. Con una conexión lenta puedes usar un `mongod.exe` que ya tengas:

```bash
MONGOMS_SYSTEM_BINARY="C:/ruta/a/mongod.exe" npm test
```

`npm run test:unit` ejecuta solo los unitarios, sin MongoDB.

## API

Todas las rutas salvo `auth` y `health` requieren sesión.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado |
| POST | `/api/auth/register` · `/login` · `/logout` | Sesión |
| GET | `/api/auth/me` | Usuario actual |
| GET/POST | `/api/categories` | Listar / crear |
| PATCH/DELETE | `/api/categories/:id` | Editar (incl. presupuesto) / borrar (reasigna a «Otros») |
| GET/POST | `/api/expenses` | Listar (`month`, `q`, `categoryId`, `page`, `pageSize`) / crear |
| GET/PATCH/DELETE | `/api/expenses/:id` | Detalle / editar / borrar |
| GET | `/api/expenses/export.csv?month=YYYY-MM` | CSV del mes |
| GET | `/api/stats?month=YYYY-MM` | Totales, presupuestos, tendencia, mes anterior, uso |
| GET | `/api/insights` · POST `/api/insights/refresh` | Análisis IA (caché 24 h) |
| GET | `/api/bank/status` · `/api/bank/connect-url` | Estado / URL de Tink Link |
| POST | `/api/bank/import` | Canjea `code` + `state` e importa |
| GET | `/api/usage` | Cuota del mes |

Los errores siempre tienen la forma `{ "error": { "code", "message", "issues?" } }`.

## Configuración de la IA

Los modelos se eligen por entorno: `CLAUDE_MODEL_INSIGHTS` y `CLAUDE_MODEL_CATEGORIZE` (por defecto `claude-opus-5-5`). Categorizar es una tarea sencilla y repetitiva: usar `claude-haiku-5-5` ahí abarata mucho el coste por usuario, pero es una decisión de producto que conviene validar con datos reales. Las peticiones a modelos que lo admiten llevan activado el **fallback de servidor** (`fallbacks: "default"`) por si un clasificador de seguridad rechaza la petición.

## Limitaciones conocidas

- Tink solo con **Demo Bank**: la creación de apps de producción en Tink está deshabilitada para esta cuenta.
- La forma de la respuesta de Tink Data v2 está **verificada en vivo** con Demo Bank. Las cuentas de Demo Bank probadas solo devolvían importes positivos (abonos).
- PRO todavía no tiene pasarela de pago: el plan se cambia a mano en la base de datos (hoja de ruta con Stripe en [docs/MONETIZACION.md](docs/MONETIZACION.md)).

## Documentación

- [docs/AUDITORIA.md](docs/AUDITORIA.md): qué se reescribió y por qué
- [docs/DEPLOY.md](docs/DEPLOY.md): despliegue paso a paso (Railway + Vercel + Atlas) y rotación de secretos
- [docs/MONETIZACION.md](docs/MONETIZACION.md): planes, precios y proyección
