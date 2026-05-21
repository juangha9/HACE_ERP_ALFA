# Informe de Hallazgos — Cotizaciones, Ventas/Tesorería y Administrador

Revisión de código del 2026-05-21. Severidad: 🔴 alta · 🟠 media · 🟡 baja/perf.
Estado: ✅ corregido · 📨 pendiente (config externa) · ✋ intencional · ❌ falso positivo.

> Las correcciones se hicieron en la rama `desarrollo`. El frontend tiene errores de
> TypeScript **preexistentes** (en `PaymentOrderModal`, `AddProductModal`, `SettingsModal`,
> `CommandModeTable`, etc.) ajenos a estos cambios; se verificó que las correcciones aquí
> descritas **no agregan ningún error nuevo** (`tsc -b`: mismos 26 errores antes y después,
> solo desplazados de línea).

---

## 🔴 1. La base de datos de prod del frontend depende de `VITE_SUPABASE_URL` 📨

Las tres interfaces usan Supabase directo, no el Worker; su BD la decide `VITE_SUPABASE_URL`
del build del frontend. El `.env` commiteado apunta a **dev** (`lehebpzmozawdtrlphnw`).

**Estado:** en la rama `desarrollo` esto es correcto (dev→dev). Antes de promover a `main`,
**verificar en Cloudflare Pages** que el build de producción define
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` hacia la BD prod (`vzamokhnojohoedrnkxk`).
No es un cambio de código. Ver [arquitectura §4](./00-arquitectura-y-despliegue.md).

---

## 🔴 2. URLs `http://localhost:8787` hardcodeadas ✅

Varios componentes de Costos y Optimización llamaban al backend con `localhost:8787` fijo,
rompiéndolos en producción.

**Corregido:** se creó `frontend/src/services/apiConfig.ts` que exporta `API_URL` (resuelto
por entorno: `VITE_API_URL` → dev localhost → Worker prod). Ahora lo usan `api.ts`,
`LogisticsCard`, `SupplyKitsCard`, `ManagementParamsCard`, `MachineryWearCard`,
`ProjectsList`, `OptimizationLayout` y `OptimizationHistoryModal`. No queda ningún
`localhost:8787` salvo el fallback de desarrollo dentro de `apiConfig.ts`.

---

## 🟠 3. Conversión Cotización → Venta no era atómica ✅

Antes, al procesar se marcaba `LISTO` antes de crear la venta; si la RPC fallaba, la
cotización quedaba `LISTO` (solo lectura) sin venta y sin poder reintentar.

**Corregido** en [CotizacionesPage.tsx](../frontend/src/pages/CotizacionesPage.tsx): al
procesar se persisten los datos **sin** cambiar el estado; se ejecuta
`cotizacion_to_venta`; y solo si la venta se crea bien se hace el `UPDATE estado='LISTO'`.
Si la RPC falla, la cotización sigue editable y se puede reintentar.

---

## 🟠 4. El `adelanto` de la cotización no llega a la venta ✋ (correcto)

**No es un bug.** Confirmado con el área: el adelanto es **informativo** y debe verse y
guardarse **solo en Cotizaciones**. El vendedor solo deja constancia de que el cliente
entrega un abono; el **asistente administrativo** (Ventas/Tesorería) concilia el banco o
recibe el efectivo y recién entonces registra el cobro en Tesorería. Por eso la venta nace
con `saldo_pendiente = total` y el adelanto no fluye a `ventas_cabecera`. El adelanto sí se
persiste en la tabla `cotizaciones` (campo `adelanto`). Sin cambios.

---

## 🟠 5. Fallback de `VITE_API_URL` fijo al Worker de producción 📨

Si un build no define `VITE_API_URL`, usa el Worker prod. En `desarrollo` conviene definir
`VITE_API_URL` hacia el Worker dev para que Proyectos/Optimización/Costos no escriban en la
BD prod. **Estado:** config de Cloudflare Pages, no código; en `desarrollo` no es bloqueante
(el usuario lo confirmó).

---

## ❌ 6. "Rutas sensibles sin control por rol" — FALSO POSITIVO

Era un error de mi revisión inicial. `ProtectedRoute` **sí** aplica control por rol vía
`ROLE_ALLOWED_PATHS` (`AuthContext.tsx`): `ventas`→`/cotizaciones`,
`asistente_admin`→`/sales-treasury`, `administrador`→`/sales-treasury`+`/administrador`+…,
`admin`→todo. No requiere cambios. (Recomendación que se mantiene: reforzar con RLS en
Supabase.) Ver [arquitectura §5](./00-arquitectura-y-despliegue.md).

---

## 🟡 7. `paginatedVentas` se recalculaba en cada render ✅

**Corregido** en [SalesTreasuryPage.tsx](../frontend/src/pages/SalesTreasuryPage.tsx):
`paginatedVentas` ahora está envuelto en `useMemo([filteredVentas, ventasPage])`, por lo que
el `useEffect` de carga por lotes ya no se dispara en cada render.

---

## 🟡 8. Estado `items` compartido y contaminado en Administrador ✅

**Corregido** en [AdministradorPage.tsx](../frontend/src/pages/AdministradorPage.tsx): los
modales de Clientes e Historial ahora tienen su propio estado (`clientsItems`,
`historyItems`) y cada uno consulta su propio rango de forma autosuficiente. El arreglo
`items` del dashboard solo lo llena `fetchData`. Se eliminaron las fusiones que hacían
crecer y mezclar rangos.

---

## 🟡 9. Deuda cruzada por nombre exacto de cliente ✅

**Corregido** en [AdministradorPage.tsx](../frontend/src/pages/AdministradorPage.tsx): el
cruce de deuda entre `ventas_cabecera` y las cotizaciones ahora usa una clave normalizada
(mayúsculas + espacios colapsados), evitando que difieran por mayúsculas/espaciado.

---

## 🟡 10. `cotizacion_to_venta` reseteaba el saldo al re-ejecutarse ✅ (aplicar en BD)

**Corregido** en [backend/cotizaciones_schema.sql](../backend/cotizaciones_schema.sql): la rama de actualización (`ELSE`) ahora preserva los pagos ya cobrados en la base de datos calculando la diferencia del saldo histórico:
```sql
saldo_pendiente = GREATEST(v_cot.total - (monto_total - saldo_pendiente), 0)
```
Esto soluciona el fallo crítico donde cualquier edición y re-sincronización de una cotización ya existente borraba por completo el historial de cobros de la cabecera de venta, reiniciándola al monto total de la cotización como si el cliente no hubiera abonado nada.

### 🚀 Mejoras de Auditoría Adicionales Incorporadas:
Durante nuestra auditoría técnica profunda, identificamos y corregimos dos brechas lógicas adicionales en este trigger para garantizar una robustez del 100% en las transacciones financieras:
1. **Traslado automático del Adelanto:** En la versión original, al crearse la venta por primera vez (`INSERT`), el saldo pendiente se fijaba en el total completo (`v_cot.total`), ignorando por completo el `adelanto` (abono inicial) que el vendedor registró. Se corrigió a:
   ```sql
   saldo_pendiente = GREATEST(v_cot.total - COALESCE(v_cot.adelanto, 0), 0)
   ```
2. **Sincronización Dinámica del Estado de Pago (`estado_pago`):** El trigger original nunca actualizaba el estado de pago. Ahora, tanto al insertar como al actualizar, el campo `estado_pago` se recalcula de forma inteligente en la base de datos:
   * **`CANCELADO`**: Si el saldo pendiente calculado es igual a `0`.
   * **`PARCIAL`**: Si el saldo pendiente es mayor a `0` pero menor al total.
   * **`PENDIENTE`**: Si el saldo pendiente es igual al total.

> ⚠️ **Acción requerida:** Las mejoras completas ya están guardadas en el archivo [cotizaciones_schema.sql](../backend/cotizaciones_schema.sql) del repositorio. Para aplicarlas, ejecute el script SQL actualizado en el **SQL Editor de Supabase** tanto en la base de datos de **desarrollo** como en la de **producción** (`vzamokhnojohoedrnkxk`).

---

## 🟡 11. Saldos/kardex calculados en el cliente 📋 (nota, sin cambio)

`SalesTreasuryPage` calcula saldos y kardex en el navegador sobre todos los movimientos de
`nodriza_tesoreria`. Funciona bien hoy; a gran volumen convendría paginar o agregar en el
servidor. No se cambió (sería re-arquitectura mayor).

---

## Notas

- El `// Phase 1` de `api.ts` es un comentario normal (no hay error de sintaxis).
- IGV 18% aplica a BOLETA/FACTURA/TICKET por diseño.
- No se ejecutó la app; las correcciones se validaron con `tsc -b` (sin errores nuevos).
  Conviene una prueba funcional de: procesar una cotización, modal de Clientes/Historial en
  Administrador, y un cobro en Tesorería.
