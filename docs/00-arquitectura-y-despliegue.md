# Arquitectura y Despliegue — ERP HACE

> Documento base. Léelo antes que los de cada interfaz, porque explica **de dónde
> salen los datos** y **a qué base de datos escribe cada módulo** en producción.

## 1. Componentes

| Componente | Tecnología | Rol |
|---|---|---|
| Frontend | React 19 + Vite + Tailwind | SPA servida (Cloudflare Pages) |
| Worker / API | Cloudflare Workers (`backend/src/index.ts`) | API REST (solo algunos módulos) |
| Base de datos | Supabase (PostgreSQL) | Datos + Auth + Realtime + Storage + Edge Functions |

## 2. Las dos formas de hablar con la base de datos

El frontend accede a Supabase por **dos caminos distintos**:

1. **Cliente Supabase directo** (`frontend/src/services/supabase.ts`), configurado con
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
2. **Worker de Cloudflare** (`frontend/src/services/api.ts` → `fetch(API_URL)`), que a su
   vez usa su propia variable `SUPABASE_URL` definida en `backend/wrangler.json`.

**Punto clave:** que un dato vaya a la base "dev" o "prod" depende de **cuál de los dos
caminos** use cada pantalla.

### Qué usa cada módulo

| Módulo | Camino | Determina la BD |
|---|---|---|
| **Cotizaciones** | 100% cliente Supabase directo | `VITE_SUPABASE_URL` |
| **Gestión de Ventas y Tesorería** | Cliente Supabase directo (los métodos `api.getVentas`, `api.getCompras`, `api.getTesoreriaMovements`, etc. usan `supabase.*` por dentro) | `VITE_SUPABASE_URL` |
| **Administrador** | Cliente Supabase directo + Edge Functions | `VITE_SUPABASE_URL` |
| Proyectos / Órdenes de producción | Worker (`/api/projects`, `/api/items`...) | `wrangler.json` |
| Optimización | Worker (`/api/optimizations`) | `wrangler.json` |
| Configuración de Costos | Worker (`/api/cost-zones`, `/api/supply-kits`...) | `wrangler.json` |
| Inventario (solicitudes) | Worker (`/api/material-requests`) | `wrangler.json` |
| Organigrama / Roles | Worker (`/api/roles`) | `wrangler.json` |

> **Consecuencia:** las TRES interfaces de este paquete de documentación
> (Cotizaciones, Ventas/Tesorería, Administrador) **no pasan por el Worker**. Su base de
> datos la decide exclusivamente `VITE_SUPABASE_URL` horneada en el build del frontend.

## 3. Configuración actual (verificada en el código)

### Worker — `backend/wrangler.json`
- Entorno por defecto (`deploy:dev`): `erp-backend-dev` → BD **dev** `lehebpzmozawdtrlphnw`
- Entorno `production` (`deploy:prod`): `erp-backend` → BD **prod** `vzamokhnojohoedrnkxk`

Esto está correcto: cada entorno del Worker apunta a su base. ✅

### Frontend — `frontend/.env` (commiteado)
```
VITE_SUPABASE_URL=https://lehebpzmozawdtrlphnw.supabase.co   # ← BD DEV
VITE_SUPABASE_ANON_KEY=sb_publishable_ZdyTx48_...            # ← clave DEV
```
`frontend/src/services/api.ts` (línea 41):
```ts
const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.DEV ? 'http://localhost:8787/api'
                          : 'https://erp-backend.juangutierrezhancco43.workers.dev/api');
```

## 4. ⚠️ Riesgos de enrutamiento de base de datos (verificar en Cloudflare Pages)

Estos puntos **no se pueden confirmar desde el código** — dependen de las variables de
entorno del proyecto en el panel de Cloudflare Pages. Hay que verificarlos:

1. **El build de producción del frontend debe definir `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_ANON_KEY` apuntando a la BD prod (`vzamokhnojohoedrnkxk`).**
   Si no se define, Vite hornea el valor del `.env` commiteado, que apunta a **DEV**.
   En ese caso, Cotizaciones, Ventas/Tesorería y Administrador en producción estarían
   **leyendo y escribiendo en la base de datos de desarrollo**, aunque el Worker esté bien
   configurado. Este es el riesgo #1.

2. **El build de la rama `desarrollo` debería definir `VITE_API_URL` hacia el Worker dev**
   (`erp-backend-dev...workers.dev/api`). Como el fallback de producción está fijo al
   Worker **prod**, un deploy de `desarrollo` que no defina `VITE_API_URL` haría que los
   módulos de Proyectos/Optimización/Costos de la rama dev escriban en la **BD prod**.

3. Mientras `VITE_SUPABASE_URL` no varíe por rama, **ambas ramas comparten la misma base
   de datos de Supabase** para las tres interfaces principales, sin importar el split del
   Worker.

**Cómo verificar rápido:** abrir la app en producción, entrar a Cotizaciones (red del
navegador → DevTools) y confirmar que las peticiones van al host
`vzamokhnojohoedrnkxk.supabase.co`. Repetir en el deploy de `desarrollo` y confirmar que
va a `lehebpzmozawdtrlphnw.supabase.co`.

## 5. Control de acceso

`frontend/src/App.tsx` envuelve todas las rutas en `ProtectedRoute`, que **sí aplica
control por rol** mediante `ROLE_ALLOWED_PATHS` (definido en
`frontend/src/context/AuthContext.tsx`). Si un usuario entra a una ruta no permitida, se le
redirige a su `ROLE_HOME`.

| Rol | Rutas permitidas |
|---|---|
| `admin` | todas (`*`) |
| `ventas` | `/cotizaciones` |
| `asistente_admin` | `/sales-treasury` |
| `administrador` | `/sales-treasury`, `/administrador`, `/personnel`, `/settings` |

Además, Cotizaciones limita al rol `ventas` a ver solo sus propios registros. Como esta
guarda es del lado del cliente, conviene complementarla con **RLS de Supabase** en
`cotizaciones`, `ventas_cabecera`, `nodriza_tesoreria`, `contacts`, `catalog_products`.

## 6. Comandos de despliegue

```bash
# Worker
cd backend
npm run deploy:dev    # wrangler deploy --env=""        → erp-backend-dev → BD dev
npm run deploy:prod   # wrangler deploy --env production → erp-backend     → BD prod

# Frontend (Cloudflare Pages): build por rama con sus variables VITE_* propias
cd frontend
npm run build
```
