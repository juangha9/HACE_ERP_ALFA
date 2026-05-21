// Base URL del Worker (API REST). Centralizado para que ningún módulo apunte a
// localhost en producción. Se resuelve en tiempo de build:
//   1. VITE_API_URL si está definida (recomendado por entorno/rama en Cloudflare Pages)
//   2. en dev (vite dev): localhost
//   3. en build de producción: Worker prod por defecto
export const API_URL =
    import.meta.env.VITE_API_URL ||
    (import.meta.env.DEV
        ? 'http://localhost:8787/api'
        : 'https://erp-backend.juangutierrezhancco43.workers.dev/api');
