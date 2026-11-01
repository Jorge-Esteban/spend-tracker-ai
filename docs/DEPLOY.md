# Despliegue: Railway (API) + Vercel (frontend) + MongoDB Atlas

Arquitectura en producción:

```
Navegador ──► https://tu-app.vercel.app            (frontend estático)
                 └── /api/*  ──rewrite──►  https://tu-api.up.railway.app/api/*  ──►  MongoDB Atlas
```

El navegador solo habla con el dominio de Vercel: la cookie de sesión es *first-party* y no hace falta CORS. Vercel reenvía `/api/*` a Railway.

## 0. Antes de empezar

- [ ] **Rota los secretos filtrados en la v1** (ver [Rotación de secretos](#rotación-de-secretos)). Es lo primero.
- [ ] Repositorio en GitHub con esta rama fusionada en `main`.
- [ ] Node 22 LTS en local para ejecutar comandos de Prisma.

## 1. MongoDB Atlas

1. **Database Access** → crea un usuario solo para esta app con rol `readWrite` sobre **su** base de datos (no `atlasAdmin`). Contraseña larga generada.
2. **Network Access** → lista de IPs permitidas:
   - Railway no da IPs de salida fijas en los planes básicos. Opción realista: `0.0.0.0/0` **compensado** con usuario de mínimos privilegios y contraseña fuerte.
   - Si contratas IPs estáticas en Railway (plan Pro), añade solo esas IPs y quita `0.0.0.0/0`.
   - Añade tu IP local mientras trabajes desde casa, y quítala después.
3. Copia la cadena de conexión `mongodb+srv://...` e incluye el nombre de la base de datos (`.../spendtracker?retryWrites=true&w=majority`). Atlas ya es un replica set, que Prisma necesita para las transacciones.
4. Crea los índices **una vez** desde tu máquina:

   ```bash
   DATABASE_URL="mongodb+srv://..." npx prisma db push
   ```

   Si la base de datos tiene datos de la v1, sigue antes el orden de la sección «Migrar datos de la v1» del [README](../README.md#migrar-datos-de-la-v1).

## 2. Backend en Railway

1. **New Project → Deploy from GitHub repo** → elige el repositorio. Root directory: la raíz del repo.
2. Railway detecta Node: `npm ci` (el `postinstall` ejecuta `prisma generate`) y `npm start`.
3. **Variables** (Settings → Variables):

   | Variable | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | cadena de Atlas |
   | `JWT_SECRET` | 48+ bytes aleatorios: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `TRUST_PROXY` | `2` (saltos de proxy: Vercel → Railway; sin esto el rate limit ve la IP de Vercel para todos) |
   | `APP_URL` | `https://tu-app.vercel.app` |
   | `CLIENT_ORIGIN` | `https://tu-app.vercel.app` |
   | `ANTHROPIC_API_KEY` | clave de la consola de Anthropic |
   | `CLAUDE_MODEL_INSIGHTS` | `claude-opus-5-5` |
   | `CLAUDE_MODEL_CATEGORIZE` | `claude-opus-5-5` (o `claude-haiku-5-5` si decides abaratar) |
   | `TINK_CLIENT_ID` / `TINK_CLIENT_SECRET` | de la consola de Tink |
   | `TINK_REDIRECT_URI` | `https://tu-app.vercel.app/bank/callback` |
   | `TINK_TEST_MODE` | `true` mientras solo uses Demo Bank |
   | `FREE_MONTHLY_EXPENSES` | `50` |

   No definas `PORT`: Railway lo inyecta.
4. **Settings → Healthcheck path**: `/api/health`.
5. **Settings → Networking → Generate domain** → apunta la URL (`https://tu-api.up.railway.app`).
6. Comprueba: `curl https://tu-api.up.railway.app/api/health` → `{"status":"ok"}`.

Nota sobre `TRUST_PROXY=2`: quien llame directamente a la URL de Railway (sin pasar por Vercel) puede falsear la cabecera `X-Forwarded-For` y esquivar el límite por IP de login. El límite de IA es por usuario y no se ve afectado, y las contraseñas siguen protegidas por bcrypt. Es un riesgo bajo y aceptado para esta fase.

Si una variable falta o es inválida, la API **no arranca** y el log de Railway dice cuál (validación con Zod).

## 3. Frontend en Vercel

1. Edita `client/vercel.json` y cambia `https://TU-API.up.railway.app` por tu dominio de Railway. Haz commit.
2. **Add New → Project** → importa el repo:
   - **Root Directory**: `client`
   - Framework: **Vite** (build `npm run build`, output `dist`)
   - No necesita variables de entorno: todas las llamadas son relativas a `/api`.
3. Despliega y abre `https://tu-app.vercel.app`. Regístrate y crea un gasto.

El segundo rewrite de `vercel.json` (`/(.*)` → `/index.html`) hace que `/bank/callback` cargue la SPA.

## 4. Tink

1. En la consola de Tink, en tu app, añade la redirect URI **exacta**: `https://tu-app.vercel.app/bank/callback` (y `http://localhost:5173/bank/callback` para desarrollo).
2. Mientras la cuenta no permita apps de producción, deja `TINK_TEST_MODE=true`: Tink Link mostrará Demo Bank.
3. Prueba una importación y revisa los logs de Railway. Si se importan 0 movimientos con `invalid` > 0, la forma real de la respuesta difiere de la documentada: ajusta `src/modules/bank/tink.parser.js` y su test.

## 5. Enable Banking (bancos reales)

1. En https://enablebanking.com/cp/applications, en tu app de **producción**, añade la redirect URL `https://tu-app.vercel.app/bank/callback`. Enable Banking solo acepta `https`.
2. La app se activa en modo *restricted* al **vincular tu cuenta** («Activate by linking accounts»). Con imagin, hazlo desde el navegador del móvil.
3. En Railway, define `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_REDIRECT_URI` y `ENABLE_BANKING_PRIVATE_KEY` con el contenido del `.pem` en una sola línea (saltos de línea como `
`). Railway no tiene tu carpeta `secrets/`.
4. Para probar en local: `DEV_HTTPS=true npm run client:dev` sirve `https://localhost:5173` con un certificado autofirmado (acepta el aviso del navegador).

## 6. Comprobación final

- [ ] `/api/health` responde.
- [ ] Registro, login y logout funcionan; la cookie `st_session` aparece como `HttpOnly; Secure; SameSite=Lax`.
- [ ] Con dos cuentas distintas no se ven los datos de la otra.
- [ ] El análisis IA se genera una vez y la segunda visita responde desde caché.
- [ ] La importación de Demo Bank trae movimientos y una segunda importación no duplica.
- [ ] La importación desde tu banco real (Enable Banking) trae gastos e ingresos.
- [ ] En Atlas → Network Access no queda ninguna IP personal olvidada.

## Rotación de secretos

En la v1 la contraseña de MongoDB y el client secret de Tink estuvieron en texto plano. Aunque el commit base de este repo los redacta, **cualquier copia anterior (otro repo, zip, captura) los expone**. Rótalos:

| Secreto | Dónde | Pasos |
|---|---|---|
| Contraseña de MongoDB | Atlas → Database Access | *Edit* en el usuario → *Edit Password* → genera una nueva → actualiza `DATABASE_URL` en Railway y en tu `.env` local. Mejor aún: crea un usuario nuevo y borra el antiguo. |
| Client secret de Tink | Consola de Tink → tu app → credenciales | Regenera el secret → actualiza `TINK_CLIENT_SECRET` en Railway y `.env`. |
| API key de Anthropic | console.anthropic.com → API Keys | Crea una nueva, actualiza `ANTHROPIC_API_KEY`, y revoca la antigua. Pon un límite de gasto mensual en la consola. |
| `JWT_SECRET` | Railway | Genera uno nuevo. Efecto: se cierran todas las sesiones (los usuarios vuelven a entrar). |

Reglas para el futuro:

- Los secretos solo viven en `.env` (ignorado por git) y en las variables de Railway. `.env.example` lleva **solo placeholders**.
- Antes de cada push: `git diff --cached` y busca `mongodb+srv://` con contraseña, `sk-ant-` o `client_secret`.
- Si un secreto llega a GitHub, **rótalo**: reescribir el historial no basta, porque puede estar ya copiado.
