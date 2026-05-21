# Documentación — ERP HACE

Documentación de las interfaces de **Cotizaciones**, **Gestión de Ventas y Tesorería** y
**Administrador**, más una guía de arquitectura/despliegue y un informe de hallazgos.

## Índice

1. [Arquitectura y Despliegue](./00-arquitectura-y-despliegue.md) — **léelo primero.**
   Explica los dos caminos a la base de datos y qué módulo escribe a qué BD en producción.
2. [Cotizaciones](./01-cotizaciones.md) — creación de cotizaciones y conversión a venta.
3. [Gestión de Ventas y Tesorería](./02-gestion-ventas-y-tesoreria.md) — cobranza, egresos,
   transferencias, kardex, comprobantes.
4. [Administrador](./03-administrador.md) — dashboard analítico, clientes, catálogo
   controlado y usuarios.
5. [Informe de Hallazgos / Bugs](./99-hallazgos-bugs.md) — riesgos priorizados por severidad.

## Resumen rápido

- Las tres interfaces documentadas usan **Supabase directo** (no el Worker). Su base de
  datos la define `VITE_SUPABASE_URL` del build del frontend.
- El split de bases `main→prod / desarrollo→dev` que está en `backend/wrangler.json` **solo**
  cubre los módulos servidos por el Worker (Proyectos, Optimización, Costos, Inventario,
  Roles).
- **Pendiente de verificar en Cloudflare Pages:** que el build de producción defina las
  variables `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` hacia la BD prod. Ver
  [hallazgo #1](./99-hallazgos-bugs.md).
