# BiwengerIA

Analizador de fantasy LaLiga con inteligencia artificial.

## Stack

- Frontend: Next.js 14 + TypeScript
- Backend: API Routes de Next.js
- IA: Claude
- Datos: catálogo público de jugadores + scraping de noticias
- Deploy recomendado: Vercel

## Qué hace hoy

- Constructor manual de plantilla usando datos públicos de LaLiga
- Análisis del mejor once, capitán y banquillo
- Recomendaciones de fichajes con razonamiento
- Escaneo de noticias para detectar lesiones, dudas y riesgo de rotación
- Generación de artículos SEO con IA

## Instalación local

```bash
npm install
cp .env.example .env.local
# añade tu ANTHROPIC_API_KEY en .env.local
npm run dev
```

## Estado actual del producto

- El analizador ya funciona con plantillas construidas manualmente.
- El generador de noticias usa IA y la vista de "muro" sigue siendo una demo editorial.
- Antes de subirlo a producción conviene añadir persistencia real, cron y almacenamiento de noticias.

## Roadmap razonable

- Persistencia real para noticias y artículos
- Cron para refresco automático de fuentes
- Historial por jornada
- Comparador de jugadores
- Modelo premium con límites y cuentas
