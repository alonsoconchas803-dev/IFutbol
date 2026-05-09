# CLAUDE.md

## Idioma
Responde siempre en español. Los comentarios en código y los mensajes de commit también en español.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Vite dev server with HMR
npm run build    # Production build
npm run lint     # ESLint
npm run preview  # Preview production build
```

## Stack

- **React 19 + Vite** — SPA, no Next.js, no TypeScript
- **Supabase** — auth + PostgreSQL database, accessed via direct REST calls (no SDK)
- **Plain CSS** — `ifutbol.css` (primary styles), `App.css`, `index.css`
- **Language** — JavaScript with JSX throughout

## Architecture

### App.jsx is the core

`src/App.jsx` (~53K) is the monolithic center of the app. It owns:
- Global state: `session`, `userRole`, `screen`, open modals, toast notifications
- Three Supabase REST wrappers: `api()` (auth endpoint), `db()` (public, no auth), `dbAuth()` (authenticated with JWT)
- Screen routing — string-based: `"home"`, `"dashboard"`, `"unidad"`
- Modal state machine — `"login"`, `"register_player"`, `"register_staff"`
- MENU config driving sidebar navigation per role
- `DashboardLayout` and `PublicLayout` wrapper components

### Role-based access

Four roles stored in the `user_roles` table: `super_admin`, `league_admin`, `referee`, `player`. After login, the role is fetched and the appropriate page component is rendered. Page components live in `src/pages/`:

| Component | Role |
|---|---|
| `SuperAdmin.jsx` | super_admin |
| `LeagueAdmin.jsx` | league_admin |
| `Referee.jsx` | referee |
| `PlayerProfile.jsx` | player |
| `Solicitudes.jsx` | request management |
| `ScheduleGenerator.jsx` | calendar/schedule creation (~40K) |
| `Viewer.jsx` | public/unauthenticated view |

### Supabase API pattern

All backend calls use plain `fetch` against the Supabase REST API, not the Supabase JS SDK. Bearer tokens come from the active session. Key tables: `canchas` (venues/courts), `user_roles`, `jugadores` (players), `ligas` (leagues), `arbitros` (referees).

### State & navigation

There is no React Router. Navigation is handled by setting `screen` state in App.jsx. Modals are opened/closed through boolean/string state passed down as props.

## Supabase credentials

Credentials are currently hardcoded in `App.jsx` (anon key + project URL). These are client-visible Supabase publishable keys — safe for the anon key, but moving them to `.env` with `VITE_` prefix is preferred if changes are made.

## Language

All UI text, variable names for domain concepts, and database column names are in **Spanish** (e.g., `canchas`, `jugadores`, `solicitudes`, `arbitros`, `ligas`). Keep this convention when adding features.

## Reference documents

Consult these files before working on related features:

- **`REGLAS_NEGOCIO.md`** — Reglas de negocio completas: roles y permisos detallados, algoritmo del generador de calendario (round-robin, regla del 75%), sistema de liguilla y copa, flujo de solicitudes, fichas de partido, planes de cobro y validaciones técnicas. Máximo **17 jugadores por equipo** y **17 filas en las fichas**.
- **`DISEÑO.md`** — Sistema de diseño completo: paleta de colores (verde `#4f8f2f`, fondo `#e9ecef`), tipografía DM Sans, variables CSS globales, especificaciones de todos los componentes (botones, tarjetas, modales, sidebar, tobar, tabs, toasts) y decisiones de UX/UI.