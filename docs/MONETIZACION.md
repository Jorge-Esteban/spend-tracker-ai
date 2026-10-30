# Monetización: planes, precios y proyección

> Documento de producto para el portfolio. Las cifras son **estimaciones de orden de magnitud** con supuestos explícitos, no un plan financiero ni asesoramiento.

## Planes

| | **FREE** | **PRO** |
|---|---|---|
| Precio | 0 € | **3,99 €/mes** o **39 €/año** (≈ 2 meses gratis) |
| Movimientos al mes | 50 | Ilimitados |
| Categorías propias y presupuestos | ✔ | ✔ |
| Categorización automática (reglas + IA) | ✔ | ✔ |
| Importación bancaria (Tink) | ✔ (dentro del tope de 50) | ✔ |
| Exportación CSV | ✔ | ✔ |
| Análisis IA: resumen, patrones, alertas | ✔ (caché 24 h) | ✔ |
| Análisis IA: predicción del mes siguiente | — | ✔ |
| Análisis IA: recomendaciones de ahorro con ahorro estimado | — | ✔ |

Lo que ya está implementado: `User.plan`, el tope mensual (`UsageCounter`, configurable con `FREE_MONTHLY_EXPENSES`) y la diferencia de contenido en los insights. Falta el cobro (ver hoja de ruta).

**Por qué este corte:** 50 movimientos cubren a alguien que apunta a mano lo importante; quien conecta el banco los supera rápido, y ese es justo el usuario que más valor obtiene. La IA «básica» en FREE muestra el producto; la predicción y las recomendaciones son lo que se paga.

## Coste variable por usuario

Supuestos (precios de la API de Claude a octubre de 2026, por millón de tokens):

- Claude Opus 5.5: 4 $ entrada / 20 $ salida. Claude Haiku 5.5: 0,10 $ / 0,50 $.
- **Insights**: ~1.500 tokens de entrada y ~3.000 de salida (incluido el razonamiento) → ≈ 0,07 $ por llamada con Opus.
- **Categorización**: lotes de hasta 100 movimientos, ~4.000 tokens de entrada y ~2.000 de salida por lote → ≈ 0,06 $ por lote con Opus, ≈ 0,002 $ con Haiku. Las reglas aprendidas reducen las llamadas con el tiempo.
- La caché de 24 h y el `dataHash` hacen que un usuario no pague más llamadas de las que pide.

| Perfil mensual | Llamadas | Coste IA (Opus en todo) | Coste IA (Haiku para categorizar) |
|---|---|---|---|
| FREE típico: 4 insights + 1 lote | 5 | ≈ 0,34 $ | ≈ 0,28 $ |
| PRO típico: 10 insights + 3 lotes | 13 | ≈ 0,88 $ | ≈ 0,71 $ |

Conclusión: **el coste dominante son los insights, no la categorización**. Si los FREE crecen mucho, las palancas son (en orden): limitar FREE a un insight por semana, usar un modelo más barato para los insights FREE y, por último, bajar el `effort`. Elegir modelo es una decisión de producto: hay que comparar calidad con datos reales antes de cambiarlo.

## Costes fijos de infraestructura

| Servicio | Inicio | Con tracción |
|---|---|---|
| Railway (API) | ~5 $/mes (Hobby) | ~20 $/mes |
| Vercel (frontend) | 0 $ (Hobby; para uso comercial hace falta Pro, 20 $/mes) | 20 $/mes |
| MongoDB Atlas | 0 $ (M0) | ~60 $/mes (M10, backups) |
| Tink | depende del contrato de producción (sin datos públicos fiables) | — |
| Stripe | 1,5 % + 0,25 € por cobro con tarjeta europea | — |

## Proyección orientativa a 12 meses

Supuestos: lanzamiento como proyecto personal con difusión orgánica (LinkedIn, comunidades), **1.000 usuarios registrados al mes 12** con crecimiento lineal, 40 % activos al mes, **conversión a PRO del 4 % de los registrados**, precio medio efectivo 3,50 € tras mezcla mensual/anual e IVA aparte.

| Mes 12 | Valor |
|---|---|
| Usuarios PRO | 40 |
| Ingresos recurrentes (MRR) | ≈ 140 €/mes |
| Comisiones Stripe | ≈ 13 €/mes |
| IA: 360 FREE activos × 0,34 $ + 40 PRO × 0,88 $ | ≈ 160 $/mes (≈ 150 €) |
| Infraestructura | ≈ 50–100 €/mes |
| **Resultado** | **≈ −70 a −120 €/mes** |

Lectura honesta: con estos supuestos **no es rentable** si los FREE usan Opus para los insights. Si el coste IA de un FREE baja a unos 2 céntimos (un insight semanal con un modelo más barato y Haiku para categorizar), cada PRO deja ≈ 2,50 € de margen (3,50 € − Stripe − ≈ 0,70 € de IA) y el punto de equilibrio con 50–100 € de costes fijos queda en torno a **30–50 usuarios PRO**. Para un portfolio, lo valioso es mostrar que el modelo de costes está medido y tiene palancas.

## Hoja de ruta de Stripe

1. **Stripe Checkout + Customer Portal** (lo más rápido y seguro: Stripe aloja el pago y la gestión de la suscripción).
   - Productos «PRO mensual» y «PRO anual» en el panel de Stripe.
   - `POST /api/billing/checkout` crea una Checkout Session con `client_reference_id = userId` y devuelve la URL.
   - `POST /api/billing/portal` abre el Customer Portal (cambiar tarjeta, cancelar, facturas).
2. **Webhook** `POST /api/billing/webhook` (body sin parsear y firma verificada con `STRIPE_WEBHOOK_SECRET`):
   - `checkout.session.completed` → guarda `stripeCustomerId` y `stripeSubscriptionId` en `User`.
   - `customer.subscription.updated` / `deleted` → `plan = PRO` si está `active` o `trialing`; si no, `FREE`.
   - Marcar los insights como `stale` al cambiar de plan (ya ocurre: la caché FREE no sirve para PRO).
   - Idempotencia: guardar los ids de evento procesados.
3. **Esquema**: `User.stripeCustomerId`, `User.stripeSubscriptionId`, `User.planRenewsAt`.
4. **UI**: botón «Pasar a PRO» cuando se alcanza la cuota o en la pestaña de análisis; badge de plan ya existe.
5. **Legal y fiscal**: precios con IVA, factura automática de Stripe (Stripe Tax si se vende fuera de España), términos y política de privacidad (datos bancarios → RGPD, base legal y encargados del tratamiento: Tink, Anthropic, Atlas).
6. **Métricas** a seguir: conversión FREE → PRO, % que alcanza la cuota, churn mensual, coste IA por usuario activo.
