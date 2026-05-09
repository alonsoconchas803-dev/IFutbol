# DOCUMENTO 2: DISEÑO Y ESTILO VISUAL

## 1. Estilo general de la app

### 1.1 Concepto

**Estilo fintech moderno y limpio**, inspirado en aplicaciones financieras profesionales. Diseño minimalista con tema claro como predeterminado, enfocado en la legibilidad y facilidad de uso. Mobile-first, ya que la mayoría de los usuarios accederán desde celular.

### 1.2 Principios

- Espacios en blanco generosos
- Bordes redondeados suaves
- Sombras sutiles para dar profundidad sin saturar
- Animaciones cortas y fluidas (transiciones de 0.15s a 0.25s)
- Jerarquía visual clara mediante tamaño y color de tipografía

---

## 2. Paleta de colores

### 2.1 Colores principales (regla 60-30-10)

| Color | Hex | Uso |
|---|---|---|
| Fondo claro | `#e9ecef` | 60% — fondo general de la app |
| Verde principal | `#4f8f2f` | 30% — botones primarios, elementos destacados |
| Verde acento | `#7fbf4d` | 10% — gradientes, hover states, brillos |

### 2.2 Variaciones de verde

- Verde claro (fondo): `#f0fdf4` o variable `--green-light`
- Verde oscuro (texto sobre claros): `#3B6D11` o variable `--green-dark`
- Verde para borde: `#c3e6a3`

### 2.3 Colores de roles

| Rol | Color | Uso |
|---|---|---|
| Super Admin | `#4f8f2f` (verde) | Pill de identificación |
| Admin de Liga | `#3b82f6` (azul) | Pill de identificación |
| Árbitro | `#f59e0b` (amarillo/dorado) | Pill de identificación |
| Jugador | `#8b5cf6` (morado) | Pill de identificación |
| Espectador | `#6b7280` (gris) | Pill de identificación |

### 2.4 Colores funcionales

| Color | Hex | Uso |
|---|---|---|
| Verde éxito | `#16a34a` | Victoria, confirmación, datos positivos |
| Amarillo advertencia | `#ca8a04` / `#f59e0b` | Empate, pendiente |
| Rojo error | `#dc2626` | Derrota, eliminar, error |
| Naranja bronce | `#CD7F32` | 3er lugar |
| Plata | `#C0C0C0` | 2do lugar |
| Oro | `#FFD700` | 1er lugar |

### 2.5 Estados de solicitudes

| Estado | Color texto | Color fondo |
|---|---|---|
| Pendiente | `#f59e0b` | `#fffbeb` |
| Aprobado | `#16a34a` | `#f0fdf4` |
| Rechazado | `#dc2626` | `#fef2f2` |

### 2.6 Colores de texto

- Texto principal: variable `--text` (negro suave, casi gris muy oscuro)
- Texto secundario: variable `--text-sub` (gris medio)
- Texto desactivado: variable `--text-muted` (gris claro)

### 2.7 Bordes y separadores

- Borde general: variable `--border` (gris muy claro `#e5e7eb` aprox)
- Color de fondo alternativo: `#f3f4f6`, `#f9fafb`, `#f8f8f8`

---

## 3. Tipografía

### 3.1 Familia tipográfica

**DM Sans** (importada desde Google Fonts) — elegida por su look moderno, legibilidad excelente en pantallas y compatibilidad con interfaces fintech.

### 3.2 Pesos utilizados

- Normal: 400 (texto regular)
- Medium: 500 (datos en tablas, etiquetas)
- Semibold: 600 (subtítulos)
- Bold: 700 (títulos secundarios)
- Extra Bold: 800 (títulos principales, números destacados)
- Heavy: 900 (cifras de marcador, ranks)

### 3.3 Tamaños

| Elemento | Tamaño |
|---|---|
| Títulos principales (H1) | 24-28px, peso 800-900, letter-spacing -0.8 a -1 |
| Subtítulos (H2-H3) | 17-22px, peso 700-800 |
| Texto principal | 14px |
| Texto secundario | 13px |
| Texto pequeño/meta | 11-12px |
| Etiquetas en mayúsculas | 11px, letter-spacing 0.7-1 |
| Marcador grande | 24-26px, peso 900 |

---

## 4. Variables CSS globales

```css
--bg: #e9ecef
--green: #4f8f2f
--green-accent: #7fbf4d
--green-light: (verde muy claro)
--green-dark: #3B6D11
--text: (texto oscuro)
--text-sub: (gris medio)
--text-muted: (gris claro)
--border: (gris muy claro)
--radius-md: (radio mediano para tarjetas)
--radius-full: (radio completo para pills)
--shadow-sm: (sombra suave)
--shadow-md: (sombra media)
--shadow-lg: (sombra fuerte para hover)
```

---

## 5. Componentes y elementos visuales

### 5.1 Botones

**Botón premium (acción principal):**
- Gradiente de verde principal a verde acento
- Texto blanco
- Padding generoso (12-13px vertical, 28-36px horizontal)
- Bordes redondeados
- Sombra sutil

**Botón outline:**
- Fondo blanco
- Borde de 1.5px verde
- Texto verde
- Hover: fondo verde claro

**Botón ghost:**
- Fondo transparente
- Sin borde
- Texto gris medio
- Hover: fondo gris muy claro

**Botón danger:**
- Variante en rojo para acciones destructivas

### 5.2 Tarjetas (cards)

- Fondo blanco
- Bordes redondeados
- Sombra suave (`shadow-md`)
- Borde de 1px gris claro
- Hover: traslación vertical de -3px y sombra más fuerte
- Padding interno: 18-22px

### 5.3 Pills (etiquetas redondeadas)

- Border-radius completo (forma de píldora)
- Padding: 5-7px vertical, 12-18px horizontal
- Fondo de color suave + texto del color principal
- Borde sutil del mismo color

### 5.4 Tablas

- Filas alternadas (efecto zebra opcional)
- Header en gris claro con texto pequeño en mayúsculas
- Bordes inferiores muy sutiles
- Números con peso 700-800 cuando son importantes

### 5.5 Modales

- Overlay con fondo negro semitransparente (28% opacidad) + blur
- Modal con bordes redondeados grandes
- Padding interno: 16-20px
- Header con título a la izquierda y botón ✕ a la derecha
- En móvil: máximo 92vh de alto, scrolleable, márgenes de 16px laterales
- Footer con botones fijos cuando el contenido excede

### 5.6 Inputs

- Borde gris claro
- Padding cómodo
- Border-radius pequeño-medio
- Focus: borde verde
- Placeholders en gris claro

### 5.7 Avatar/iniciales

- Círculo con gradiente verde (de `#4f8f2f` a `#7fbf4d`)
- Iniciales en blanco con peso 800
- Cuando hay foto: imagen circular con object-fit cover

### 5.8 Sidebar

- Fondo blanco
- Borde derecho gris claro
- Items con padding generoso
- Item activo: fondo verde claro + texto verde + peso 700
- Hover: fondo verde claro suave
- Footer con avatar e info del usuario

### 5.9 Topbar

- Fondo blanco
- Altura: 60px
- Sombra sutil inferior
- Logo a la izquierda
- Pill de rol y botones a la derecha
- Botón hamburguesa para abrir sidebar

### 5.10 Tabs

- Botones tipo pill para filtros
- Estado activo: fondo verde + texto blanco
- Estado normal: fondo blanco + borde gris + texto gris medio
- Hover: borde verde + texto verde

### 5.11 Empty states

- Icono grande emoji centrado
- Texto principal en gris medio
- Texto secundario más pequeño en gris claro
- Padding generoso vertical

### 5.12 Toast notifications

- Aparece arriba a la derecha
- Fondo verde para éxito, rojo para error
- Texto blanco
- Desaparece automáticamente en 3-3.5 segundos
- Animación suave de entrada/salida

### 5.13 Spinner

- Círculo con borde verde en rotación
- Centrado en su contenedor
- Tamaño moderado

---

## 6. Iconografía

### 6.1 Estilo

- Emojis nativos para identificación rápida e informal
- Iconos SVG cuando se necesita mayor formalidad (logo IFútbol)

### 6.2 Iconos por contexto

| Contexto | Emoji |
|---|---|
| Super Admin | 👑 |
| Admin de Liga / Cancha | 🏟️ |
| Árbitro | 🟡 |
| Jugador | ⚽ |
| Espectador | 👁️ |
| Equipo | 👕 |
| Torneo | 🏆 |
| Calendario | 📅 |
| Ficha de partido | 📝 |
| Estadísticas / Tabla | 📊 |
| Goleadores | 🥇 |
| Mejor ofensiva | ⚔️ |
| Mejor defensiva | 🛡️ |
| Fair Play | 🤝 |
| Solicitudes | 📋 |
| Inicio | 🏠 |
| Cerrar sesión | 🚪 |
| Pendiente | ⏳ |
| Aprobado | ✅ |
| Rechazado | ❌ |
| Bracket | 🎯 |
| Descanso | 😴 |
| Publicidad | 📢 |

### 6.3 Logo de IFútbol

- Cuadrado con bordes redondeados (radius 9)
- Gradiente verde de `#4f8f2f` a `#7fbf4d`
- Icono SVG de balón de fútbol en blanco (círculo con líneas curvas)
- Tamaño en topbar: 34x34px
- Texto "IFútbol" en peso 800, letter-spacing -0.5

---

## 7. Diseño de la página principal (Home pública)

### 7.1 Estructura

- Topbar fijo arriba con logo y botón "Mi panel" (si está logueado)
- Sidebar oculto por defecto, se abre con hamburguesa
- Main: título "Unidades deportivas" + subtítulo
- Grid responsivo de tarjetas de unidades deportivas
- Tarjeta de publicidad rotatoria

### 7.2 Tarjetas de unidades deportivas

- Fondo blanco
- Icono de estadio 🏟️ grande
- Nombre de la unidad en peso 800
- Dirección en texto gris pequeño
- Footer: número de canchas en verde
- Hover: levanta 3px y aumenta sombra

### 7.3 Tarjeta de publicidad

- Etiqueta "PUBLICIDAD" en mayúsculas pequeñas
- Imagen rotatoria cada 12 segundos
- Transición de izquierda
- Si no hay imágenes: placeholder con emoji 📢

---

## 8. Diseño de página de Unidad Deportiva

### 8.1 Header

- Botón "← Volver" en la parte superior
- Icono grande de estadio en cuadro verde claro
- Nombre de la unidad como H1
- Dirección + número de canchas en gris

### 8.2 Selector de torneos

- Botones tipo pill horizontales
- Etiqueta "Torneos:" a la izquierda
- Cada botón con icono 🏆 + nombre del torneo
- Botón activo en verde claro

### 8.3 Información del torneo activo

- Tarjeta con nombre del torneo, día, turno y temporada
- Stats a la derecha: número de equipos y partidos en verde grande

### 8.4 Tabs

- Tabs scrolleables horizontalmente
- 7 secciones: Tabla, Partidos, Goleadores, Equipos, Mejor ofensiva, Mejor defensiva, Fair play
- (Próximamente: Clasificación con bracket)

### 8.5 Tabla de posiciones

- Filas con número de rank en badge circular
- Top 3 con colores: oro, plata, bronce
- Color del equipo como pequeño círculo o escudo
- Datos: PJ, G (verde), E (amarillo), D (rojo), GF, GC, DIF (verde si positivo, rojo si negativo), PTS

### 8.6 Lista de partidos

- Tarjetas por partido
- Header: jornada y fecha
- Centro: equipos vs marcador grande
- Equipo ganador con goles en verde
- Pills de goleadores debajo si los hay

### 8.7 Tabla de goleadores

- Lista vertical
- Rank con badge dorado/plata/bronce para top 3
- Nombre del jugador + equipo
- Número de goles grande en verde
- Barra horizontal de progreso proporcional al máximo

### 8.8 Vista de equipos

- Grid de tarjetas
- Borde superior de 4px del color del equipo
- Escudo o letra inicial sobre fondo de color
- Stats: pts (verde), V, D

---

## 9. Diseño de paneles internos (Dashboards)

### 9.1 Layout general

- Topbar idéntica al resto
- Sidebar permanente a la izquierda con menú según rol
- Main area con contenido scrolleable
- Avatar y nombre del usuario en footer del sidebar

### 9.2 Panel Super Admin

**Pestañas en sidebar:** Panel Admin, Canchas, Torneos, Clasificación, Usuarios, Solicitudes

### 9.3 Panel Admin de Liga

**Pestañas en sidebar:** Mi Torneo, Equipos, Torneos, Clasificación, Jugadores

**Tabs internas:** Equipos, Jugadores, Calendario

### 9.4 Panel Árbitro

**Pestañas en sidebar:** Mis Partidos, Ficha de Partido

### 9.5 Panel Jugador

**Pestañas en sidebar:** Mi Perfil, Mi Equipo, Torneos

---

## 10. Diseño de la ficha de partido

### 10.1 Características generales

- Cabe en una hoja tamaño carta lista para imprimir
- 17 filas de jugadores por equipo (las vacías se dejan en blanco para escribir a mano)
- Apartado de observaciones de ancho completo (extremo a extremo)

### 10.2 Encabezado

- Fondo verde oscuro (`#2d5a1b`)
- Texto blanco
- Izquierda: logo unidad + nombre unidad + nombre torneo
- Centro: jornada, fecha, hora, cancha
- Derecha: logo IFútbol + nombre

### 10.3 Marcador central

- Nombres de equipos a los lados
- Dos cuadrados grandes con borde para el marcador, separados por ":"

### 10.4 Sección de equipos

- Grid de 2 columnas separadas por borde central
- Cada equipo tiene su header con escudo y nombre
- Encabezado de columnas: Jugador, Asist., Goles
- 17 filas con: foto + (#número, nombre completo, camiseta, AF) + checkbox asistencia + cuadro de goles
- Footer: cuadro de "Faltas cometidas"

### 10.5 Pie de ficha

- Apartado de Observaciones que va de extremo a extremo (ancho completo)
- Línea para nombre del árbitro
- Línea para firma del árbitro

### 10.6 Versión digital interactiva

- Mismo diseño que el PDF
- Casillas de asistencia: tap para marcar/desmarcar (verde cuando está marcada)
- Goles: incrementables con tap, fondo verde claro cuando hay goles
- Marcador final: editable
- Faltas: editable
- Observaciones: campo de texto

---

## 11. Decisiones de UX/UI tomadas

### 11.1 Memoria del usuario

- Sesión persistente entre vistas
- Avatar y rol siempre visibles
- Cambio fluido entre Home pública y Dashboard

### 11.2 Mobile-first

- Sidebar oculto por defecto en home, accesible por hamburguesa
- Modales adaptables con scroll interno
- Botones grandes para tap en móvil
- Grid responsivo que se ajusta automáticamente

### 11.3 Feedback visual inmediato

- Toasts para confirmaciones y errores
- Animaciones de entrada (`animate-in`) al cambiar de sección
- Hover states claros en todos los elementos clickeables
- Estados de loading con spinner

### 11.4 Jerarquía clara

- Información más importante en primera vista (sin scroll)
- Datos secundarios en hover o expandibles
- Acciones primarias destacadas con botón verde gradiente
- Acciones destructivas en rojo

### 11.5 Personalización por rol

- Cada rol ve solo lo que le concierne
- Pill de rol siempre visible para identificar
- Sidebar con menú filtrado según permisos

### 11.6 Sin precios públicos

- Los planes y precios NO aparecen en la página
- Solo se muestran en presentación de ventas personalizada
- Estrategia: contacto directo con cliente

### 11.7 Login y registro como modales

- No hay página separada de login
- Todo se maneja en modales superpuestos
- Cierre fácil con clic fuera o botón ✕

### 11.8 Bracket visual interactivo

- Diseño tipo árbol horizontal
- Tres columnas: Cuartos → Semis → Final + 3er lugar
- Partidos clickeables para registrar resultado
- Equipo ganador resaltado en verde

### 11.9 Filtros visuales claros

- En Solicitudes: filtros tipo pill con contador integrado
- Filtro activo en verde sólido, inactivo en blanco con borde

### 11.10 Confirmación de acciones destructivas

- Eliminar requiere confirmación
- Rechazar solicitud pide confirmación
- Aprobar requiere completar todos los campos requeridos (liga para admin, canchas para árbitro)
