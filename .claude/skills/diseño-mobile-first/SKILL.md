---
name: diseño-mobile-first
description: Guía a Claude para producir CSS y componentes UI optimizados primero para móvil en futbol7-app. Usar cuando el usuario pida crear componentes, diseñar pantallas o vistas, agregar modales, estilizar elementos, hacer algo responsivo, arreglar layouts en móvil, o cualquier tarea visual o de CSS.
---

# Diseño Mobile-First — futbol7-app

## Contexto del proyecto

- **Stack:** React 19 + Vite, CSS plano en `src/ifutbol.css`. Sin Tailwind ni frameworks UI.
- **Usuarios:** árbitros, jugadores y admins de liga, mayoritariamente en el celular en la cancha o en movimiento.
- **Paleta y variables:** definidas en `DISEÑO.md` en la raíz del proyecto. **Leerlo antes de escribir cualquier estilo.**

---

## Paso 1 — Antes de escribir CSS

1. Leer `DISEÑO.md` para reutilizar la paleta, variables CSS y tokens ya definidos.
2. Revisar `src/ifutbol.css` para no duplicar clases existentes.
3. Si existe un patrón similar en la app, reutilizarlo en vez de inventar uno nuevo.

---

## Paso 2 — Filosofía mobile-first obligatoria

Escribir **primero** el CSS para pantallas de 320–375 px. Luego escalar con `@media (min-width: ...)`. **Nunca al revés.**

### Breakpoints estándar

```css
/* Base (mobile): 0–639px — sin media query */

@media (min-width: 640px) { /* Tablet */ }
@media (min-width: 1024px) { /* Desktop */ }
@media (min-width: 1280px) { /* Wide */ }
```

---

## Paso 3 — Reglas táctiles obligatorias

| Elemento | Mínimo |
|---|---|
| Botones, links, inputs clickeables | 44 × 44 px |
| Espacio entre elementos clickeables | 8 px |
| Inputs de formulario (altura) | 48 px |
| Botones de acción primaria en mobile | 56 px de alto |

---

## Paso 4 — Tipografía responsiva

- **Tamaño base mínimo: 16px en mobile** — evita el zoom automático en iOS.
- Usar **rem**, no px, para tamaños de fuente.
- Headings con `clamp()` para escalado fluido:
  ```css
  font-size: clamp(1.25rem, 4vw, 1.75rem);
  ```
- `line-height` mínimo de **1.5** en cuerpo de texto.

---

## Paso 5 — Patrones de layout para futbol7-app

| Elemento | Mobile | Tablet/Desktop |
|---|---|---|
| Tablas (jugadores, calendarios, resultados) | Cards apiladas, una por fila | Tabla horizontal normal |
| Sidebar (DashboardLayout) | Menú hamburguesa o bottom nav | Sidebar fijo a la izquierda |
| Modales (login, register_player, etc.) | Full-screen o bottom-sheet | Centrado con overlay |
| Formularios largos | Un campo por fila | 2 columnas agrupadas |
| Listas de partidos / jornadas | Cards verticales | Grid de 2–3 columnas |

---

## Paso 6 — Inputs móviles inteligentes

Siempre usar el `type` y atributos correctos:

```html
<!-- Teléfono -->
<input type="tel" autocomplete="tel" />

<!-- Email -->
<input type="email" autocomplete="email" autocapitalize="none" />

<!-- Dorsal / goles / número -->
<input type="number" inputmode="numeric" min="1" max="99" />

<!-- Fecha de partido -->
<input type="date" />

<!-- Búsqueda -->
<input type="search" autocomplete="off" />

<!-- Nombre en camiseta -->
<input type="text" autocapitalize="characters" />
```

---

## Paso 7 — Performance en mobile

- Animaciones **solo con `transform` y `opacity`** — nunca animar `width`, `height`, `top`, `left`.
- Imágenes (logos de equipos, fotos de jugadores) con `loading="lazy"`.
- Limitar `box-shadow` y `backdrop-filter` en elementos que se repiten en listas largas.

---

## Paso 8 — Plantillas listas para usar

### Card mobile-first

```css
.card {
  /* Mobile base */
  background: var(--surface, #fff);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 1rem;
  width: 100%;
  box-sizing: border-box;
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s, box-shadow 0.2s;
}

@media (min-width: 640px) {
  .card {
    padding: 1.25rem 1.5rem;
  }
}

@media (min-width: 1024px) {
  .card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-lg);
  }
}
```

### Modal mobile-first (full-screen en mobile, centrado en desktop)

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end; /* bottom-sheet en mobile */
  justify-content: center;
  z-index: 1000;
  padding: 0;
}

.modal-box {
  background: #fff;
  border-radius: 1.25rem 1.25rem 0 0;
  padding: 1.5rem 1rem;
  width: 100%;
  max-height: 92vh;
  overflow-y: auto;
  box-sizing: border-box;
}

@media (min-width: 640px) {
  .modal-overlay {
    align-items: center;
    padding: 1rem;
  }
  .modal-box {
    border-radius: 1.25rem;
    width: 100%;
    max-width: 440px;
    max-height: 90vh;
    padding: 2rem;
  }
}
```

### Patrón tabla → cards en mobile

```css
/* En mobile: ocultar la tabla, mostrar cards */
.tabla-desktop { display: none; }
.cards-mobile  { display: flex; flex-direction: column; gap: 0.75rem; }

.card-fila {
  background: var(--surface, #fff);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

@media (min-width: 640px) {
  .tabla-desktop { display: table; width: 100%; }
  .cards-mobile  { display: none; }
}
```

---

## Paso 9 — Checklist final (aplicar a cada componente)

Antes de dar el código por terminado, verificar:

- [ ] ¿Funciona bien a **320 px** de ancho?
- [ ] ¿Los botones se pueden tocar cómodamente con el pulgar?
- [ ] ¿El texto es legible **sin hacer zoom**?
- [ ] ¿No hay **scroll horizontal** accidental?
- [ ] ¿Los modales y formularios son cómodos en mobile?
- [ ] ¿Las tablas tienen una versión mobile usable (cards)?
- [ ] ¿Se usaron las **variables CSS de `DISEÑO.md`**?
- [ ] ¿Las animaciones usan solo `transform` y `opacity`?
- [ ] ¿Los inputs tienen el `type` e `inputmode` correcto para mobile?
