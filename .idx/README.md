# ERP HACE - Project IDX Setup

Este proyecto está configurado para funcionar con **Google Project IDX**, un entorno de desarrollo en la nube.

## 🚀 Cómo abrir en Project IDX

1. Ve a [idx.google.com](https://idx.google.com)
2. Haz clic en "Import a repo"
3. Pega esta URL: `https://github.com/juangha9/ERP_HACE.git`
4. ¡Espera a que se configure automáticamente!

## ⚙️ Configuración Automática

El archivo `.idx/dev.nix` configura automáticamente:

- ✅ Node.js 20
- ✅ Instalación de dependencias (frontend y backend)
- ✅ Servidor de desarrollo del frontend en puerto 5173
- ✅ Extensiones VS Code recomendadas (ESLint, Prettier, Tailwind)

## 🛠️ Comandos Disponibles

### Frontend
```bash
cd frontend
npm run dev    # Servidor de desarrollo
npm run build  # Compilar para producción
```

### Backend
```bash
cd backend
npm run dev    # Desarrollo local con Wrangler
npm run deploy # Desplegar a Cloudflare Workers
```

## 📝 Variables de Entorno

Recuerda configurar las variables de entorno necesarias:

### Backend (`.dev.vars`)
```
SUPABASE_URL=tu_url_de_supabase
SUPABASE_ANON_KEY=tu_clave_anonima
```

### Frontend (`.env`)
```
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_ANON_KEY=tu_clave_anonima
```

## 🌐 Acceso a la Aplicación

Una vez iniciado el servidor de desarrollo, Project IDX te proporcionará una URL pública para acceder a tu aplicación.

---

**Desarrollado con ❤️ usando Project IDX**
