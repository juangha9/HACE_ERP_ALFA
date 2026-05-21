# Interfaz: Administrador

**Ruta:** `/administrador` · **Componente:** `frontend/src/pages/AdministradorPage.tsx`  
**Origen de datos:** Cliente de Supabase directo, RPCs y Edge Functions integradas.

---

## 1. Propósito y Alcance

La interfaz del **Administrador** actúa como la consola central de dirección estratégica, auditoría analítica de consumo y control de seguridad del ERP. Su diseño combina un potente dashboard analítico de consumo de materiales controlados y facturación de servicios con módulos de gestión avanzada para el catálogo controlado de productos, administración de usuarios del sistema y conciliación de deuda consolidada por cliente.

---

## 2. Dashboard Analítico de Producción

El dashboard procesa y consolida en vivo el consumo real de planchas, metros y servicios facturados en el ERP:
*   **Fuente de Datos**: Los consumos se extraen directamente uniendo la tabla `cotizaciones_items` con `cotizaciones` (excluyendo documentos anulados `ELIMINADO`), acotado por la fecha de emisión. La analítica de cobros y saldos vencidos consulta directamente `ventas_cabecera`.
*   **Métricas Core (KPIs)**:
    *   **Tableros (PLS/PLN)**: Consolidación de planchas de material controlado consumidas (acumula cantidad de ítems cuya unidad sea `'PLS'` o `'PLN'`).
    *   **Canto (MTS/ML)**: Sumatoria de metros lineales de canto aplicados (acumula cantidad de ítems cuya unidad sea `'MTS'` o `'ML'`).
    *   **Servicios (SERV)**: Total acumulado de ingresos netos por concepto de maquinado y servicios adicionales (acumula cantidad de ítems de tipo `'SERV'`).

### A. Tendencia Temporal y Exclusión de Fines de Semana
El gráfico de tendencia del consumo de planchas controladas (`PLS`) se puede agrupar bajo tres criterios de agregación: `DIARIO`, `SEMANAL` o `MENSUAL`. El panel analítico ofrece una opción de alternar la **exclusión de fines de semana**, recalculando y removiendo los días sábados y domingos de la serie temporal para evitar caídas artificiales de consumo en la curva y centrar la analítica en la productividad laboral neta.

### B. Análisis Comparativo Inter-Rango
Permite evaluar la productividad comparando el rango de fechas actual contra un periodo anterior homólogo (semana/mes previo) o un mes histórico específico. La serie analítica realiza una **alineación posicional** del arreglo temporal en el cliente, permitiendo superponer y contrastar ambas curvas en el gráfico de manera exacta.

---

## 3. Consolidación de Clientes y Deuda Normalizada

El panel de clientes resume el comportamiento de compra de cada contacto en el ERP, agrupando el total de ventas únicas y el volumen acumulado de consumo de planchas controladas:
*   **El Desafío de la Deuda Cruzada**: La deuda se calcula sumando el campo `saldo_pendiente` de la tabla `ventas_cabecera` en estado no `CANCELADO`. Para evitar que diferencias tipográficas de mayúsculas, minúsculas o espacios múltiples impidan el cruce correcto de la deuda, se implementa una función de normalización idéntica en ambos extremos:
    ```typescript
    const normName = (s: string | null | undefined) => (s || '').trim().toUpperCase().replace(/\s+/g, ' ');
    ```
*   **Resolución de Duplicidad de Contactos**: El formulario integrado para el alta y edición rápida de clientes (`contacts`) intercepta y controla de forma elegante excepciones de claves únicas duplicadas (código SQL de error `23505` para RUC/DNI ya registrados en base de datos), previniendo cierres inesperados de la interfaz.

---

## 4. Modal "Ajuste Avanzado"

Sub-panel modular protegido que despliega las opciones críticas del ERP organizadas en dos secciones:

### A. Gestión de Catálogo de Materiales Controlados
*   **Propósito**: Administrar la taxonomía del catálogo de productos y fijar precios mínimos de venta en vivo.
*   **Operaciones**: Permite el filtrado dinámico por Categoría → Familia → Subfamilia (resueltos mediante `catalogService`). El administrador puede crear o editar productos estableciendo el nombre base, presentación física, unidad de medida, costo de referencia y el **precio mínimo** (este precio mínimo es el que el validador de Cotizaciones consultará antes de permitir el pase a `LISTO`).

### B. Gestión de Usuarios y Reseteo de Contraseñas
*   **Listado Seguro**: Carga la nómina de usuarios del sistema a través de la llamada RPC **`get_all_users_for_admin`**.
*   **Generación de Enlaces de Recuperación**: El administrador puede disparar un enlace temporal para restaurar la contraseña del usuario. El frontend invoca la Edge Function de Supabase **`generate-reset-link`** pasándole el `email` del usuario y definiendo un `redirectTo` apuntando a `<dominio>/set-password`. La Edge Function devuelve el enlace seguro de Supabase Auth para ser copiado al portapapeles con un clic.

---

## 5. Tablas y Objetos de Base de Datos Utilizados

| Objeto / RPC | Propósito | Operación en Interfaz |
|---|---|---|
| `cotizaciones_items` | Detalle físico de cotizaciones procesadas. | Base de cálculo para métricas de planchas, metros y servicios del dashboard. |
| `cotizaciones` | Cabecera del documento de cotización. | Filtros por rango de fecha y exclusión de anulados (`ELIMINADO`). |
| `ventas_cabecera` | Cabecera del registro financiero de ventas. | Base para cálculo de deuda normalizada por cliente. |
| `contacts` | Directorio maestro de clientes del ERP. | Lectura y actualización del registro del cliente. |
| `catalog_products` | Catálogo de materiales. | Alta, baja y edición de precios mínimos. |
| **RPC `get_all_users_for_admin`** | Consulta de usuarios registrados en el sistema. | Carga del listado del panel de seguridad de usuarios. |
| **Edge Function `generate-reset-link`** | Emisión de tokens de acceso para reseteo. | Invocación de enlace seguro por HTTP POST desde el cliente Supabase. |

---

## 6. Notas de Comportamiento y Aislamiento de Estados
*   **Modularidad de Estados (Evitar Contaminación)**: Los modales de "Clientes" e "Historial de Consumo" manejan sus propios arreglos locales (`clientsItems` y `historyItems`) con consultas asíncronas independientes limitadas a su propio contexto. Se eliminó la ineficiencia previa donde estas consultas agregaban registros de forma desmedida en el arreglo `items` del dashboard analítico principal, evitando la mezcla involuntaria de datos y asegurando la integridad del rendimiento de la página.
*   **Seguridad y Control de Acceso por Rol**: El acceso a la ruta `/administrador` está estrictamente restringido en el frontend por la guarda `ProtectedRoute` utilizando `ROLE_ALLOWED_PATHS` (autorizado solo para roles `admin` y `administrador`). Se recomienda complementar esta restricción del cliente activando políticas de seguridad RLS en Supabase en las tablas sensibles de configuración y costos.
