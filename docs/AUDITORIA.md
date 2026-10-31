# Auditoría de la v1 y decisiones de la v2

La v1 funcionaba como demo local pero tenía fallos que la hacían inutilizable en producción (sin usuarios, secretos en el código) y varias funciones que **no funcionaban**. La v2 se reescribió desde cero priorizando la limpieza sobre la compatibilidad.

## Hallazgos y cómo se resolvieron

### Funciones rotas

| v1 | Impacto | v2 |
|---|---|---|
| `analysis.js` importaba `predictSpending` y `recommendSavings`, que no existían (`claude.js` exportaba `getPredictions` / `getRecommendations`) | Las dos rutas daban 500 y, al ir en un `Promise.all`, **toda la pestaña de análisis fallaba** | Un único endpoint `/api/insights` con un solo servicio |
| `/spending-analysis` pasaba un **texto** a `analyzeSpending`, que esperaba un array, y cacheaba el objeto de error | Análisis vacío o error persistido | El resumen se construye con una función pura (`buildInsightInput`) y está testeado |
| La caché se escribía pero **nunca se leía** | 3 llamadas a Opus en cada clic | Caché `AiInsight` única por usuario, TTL 24 h, `dataHash` y flag `stale` |
| La importación de Tink llamaba a `/data/v2` pero leía campos v1 (`description`, `amount` numérico, `date`) | **Todas las transacciones se descartaban** | Parser v2 puro (`descriptions.display`, `amount.value.{unscaledValue,scale}`, `dates.booked`) con paginación por `nextPageToken` y `accountIdIn` |
| El OAuth del frontend sondeaba la URL de la ventana padre, pero el `code` llegaba al popup | La conexión bancaria nunca se completaba | Flujo de página completa con vuelta a `/bank/callback` |

### Seguridad

| v1 | v2 |
|---|---|
| Sin autenticación: cualquiera leía y borraba todo | Registro / login con bcrypt, JWT en cookie `httpOnly` + `SameSite=Lax` (+ `Secure` en producción). Todas las consultas filtran por `userId`; hay tests de aislamiento entre usuarios |
| Client secret de Tink en el código y client id en el frontend | Credenciales solo por variables de entorno, validadas al arrancar |
| OAuth sin `state` (CSRF) | `state` firmado (JWT de 15 min, ligado al usuario) y verificado al importar |
| `cors()` abierto | Allowlist `CLIENT_ORIGIN`; en producción el frontend usa un proxy same-origin |
| Logs con el código de autorización y el token | pino con redacción de cookies, cabeceras de auth, `code`, `state`, tokens y contraseñas; de Tink solo se registra el status |
| Se devolvía `error.message` en bruto | Middleware global: Zod → 400, `AppError` → su status, Prisma P2025 → 404, P2002 → 409, resto → 500 genérico |
| Sin límites | Rate limit general, más estricto en auth, y por usuario en IA (solo cuando de verdad se llama a Claude) |
| Sin validación: importes `NaN` aceptados, ObjectId inválido → 500 | Esquemas Zod para body, query y params |

### Modelo de datos

| v1 | v2 |
|---|---|
| Dinero en `Float` | `amountCents Int` + `currency`; Tink se convierte con BigInt desde el importe escalado |
| `Expense.category` texto libre; el modelo `Category` y `budgetLimit` no se usaban | `Category` por usuario (color, icono, `monthlyBudgetCents`, `isFallback`) sembrada al registrarse; `Expense.categoryId` |
| Dedup bancaria por descripción + fecha en hora local | `externalId` = id de transacción de Tink, índice `userId + externalId` |
| — | `MerchantRule`, `AiInsight`, `UsageCounter`, `User.plan` |

### IA

| v1 | v2 |
|---|---|
| Una llamada a Opus **por gasto**, también en importaciones | Regla aprendida → **una llamada por lote** (hasta 100 movimientos) → «Otros» |
| Parseo de JSON de texto libre | Salidas estructuradas con Zod (`messages.parse`), comprobación de `stop_reason` (`refusal`, `max_tokens`) y fallback de servidor |
| Modelo fijo en el código (`claude-opus-4-1`) | Modelos por variable de entorno |
| Se enviaban datos crudos | Solo agregados (totales por mes y categoría, top comercios); los textos de los movimientos se tratan como datos, no como instrucciones |

### Código y frontend

| v1 | v2 |
|---|---|
| Agregación por categoría duplicada 4 veces, O(n²) | `stats/aggregate.js`: funciones puras O(n) y testeadas |
| Código muerto: SQLite, `uuid`, `body-parser`; `/bank/status` siempre decía «conectado» | Eliminado; `/bank/status` informa de lo real (configurado, nº importados, última importación) |
| Create React App (deprecado), `App.js` monolítico, `localhost` hardcodeado | Vite + componentes por feature, rutas relativas `/api` |
| `.reverse()` rompía el orden | Orden en la base de datos: fecha desc, luego creación desc |
| Muchas clases CSS sin usar | Hoja única con variables y modo oscuro |
| Textos que prometían de más («Imagin Real», «tiempo real») | Textos honestos: Demo Bank, importación puntual |

## Decisiones que se apartan del plan inicial (y por qué)

1. **Vitest 3.2 y Vite 6 en lugar de las últimas versiones.** La máquina de desarrollo tiene Node 21.4 y Vitest 5 / Vite 7 requieren APIs de Node ≥ 21.7 (`util.styleText`). Recomendación: pasar a **Node 22 LTS** (21 ya no tiene soporte) y entonces actualizar ambas.
2. **El flag `stale` no regenera solo.** Cualquier cambio de datos marca el análisis como desactualizado, pero la llamada a Claude solo ocurre si no hay caché, si caducó (24 h) o si el usuario pulsa «Regenerar». Y aun así, si el `dataHash` no cambió, no se llama. Así cada usuario cuesta, como mucho, lo que decida.
3. **FREE recibe resumen, patrones y alertas** (además de lo previsto) porque las alertas salen gratis del mismo resumen.
4. **El código de Tink lo canjea el backend, no se guarda el token.** Cada importación es puntual; no hay «conexión permanente» que mantener ni token que filtrar.
5. **Índice `userId + externalId` no único.** MongoDB trata los `null` de los gastos manuales como valores repetidos y Prisma no permite índices parciales en MongoDB. Dos importaciones simultáneas del mismo usuario podrían duplicar; es improbable y está documentado.
6. **CSV con `;` y coma decimal**, con BOM UTF-8 y protección contra inyección de fórmulas, porque el público objetivo abre los CSV en Excel en español.
7. **Se añadió la categoría «Vivienda»** a las de serie: alquiler o hipoteca suele ser el mayor gasto y en «Otros» distorsionaba el análisis.
8. **`claim-orphans` tiene un paso previo de limpieza**: el índice único antiguo `categories.name` impediría que dos usuarios tuvieran una categoría «Comida».

9. **Gastos e ingresos (añadido tras la reescritura).** La v1 solo registraba gastos y descartaba los abonos del banco. Ahora cada movimiento y cada categoría tienen tipo (`EntryKind`): el importe se guarda siempre en positivo, las categorías de un tipo no se pueden usar con el otro, los presupuestos son solo de gasto y cada tipo tiene su categoría de reserva. El modelo Prisma se sigue llamando `Expense` (colección `expenses`) para no migrar datos; en la API y la UI se habla de «movimientos».

## Verificado en vivo

- Tink Data v2 con Demo Bank: canje del código, cuentas, paginación y forma de las transacciones (`amount.value.{unscaledValue,scale}`, `descriptions`, `dates.booked`, `types.type`, `status`). Una cuenta devolvió 2.000 movimientos: por eso ahora se piden solo los últimos 12 meses. Demo Bank usa `scale: "1"` (p. ej. `unscaledValue: "10800"` = 1.080,00 €), que el conversor con BigInt resuelve bien, y sus movimientos «Payment» llegan en positivo: se importan como ingresos.
- Llamadas reales a Claude (categorización por tipo e insights FREE/PRO) con salidas estructuradas.
- MongoDB Atlas real: `prisma db push` sobre la base `spendtracker` (estaba vacía: no había datos de la v1 que migrar) y prueba de punta a punta (registro, gasto, ingreso, categorización con Claude, estadísticas, CSV y transacciones). El usuario de prueba se borró después.

## Pendiente de verificar

- El despliegue en Railway + Vercel (ver [DEPLOY.md](DEPLOY.md)).
- Bancos reales con Tink: requiere una app de producción en Tink.

La contraseña de Mongo y el client secret de Tink filtrados en la v1 ya se han rotado.
