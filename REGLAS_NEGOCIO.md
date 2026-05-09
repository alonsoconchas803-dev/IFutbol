# DOCUMENTO 1: REGLAS DE NEGOCIO Y LÓGICA

## 1. Roles del sistema

La aplicación maneja 5 roles, cada uno con permisos y limitaciones específicas.

### 1.1 Super Admin

**Identificador:** `super_admin`

**Permisos:**
- Control total sobre toda la plataforma
- Crear, editar y eliminar unidades deportivas (canchas)
- Crear, editar y eliminar ligas/torneos
- Aprobar o rechazar solicitudes de registro de árbitros y admins de liga
- Asignar admin de liga a una liga específica al aprobar su solicitud
- Asignar una o varias unidades deportivas a árbitros al aprobar su solicitud
- Configurar imágenes de publicidad que rotan en la página principal
- Acceso al resumen general del sistema
- Gestión de usuarios

**Limitaciones:**
- Es el único rol que se asigna directamente desde la base de datos (no por solicitud)
- Email del Super Admin actual: alonsoconchas803@gmail.com

### 1.2 Admin de Liga

**Identificador:** `league_admin`

**Permisos:**
- Gestionar equipos de su liga asignada (crear, editar, eliminar)
- Gestionar jugadores inscritos en los equipos de su liga
- Subir escudos de equipos
- Generar calendario de jornadas
- Generar liguilla y copa al final del torneo regular
- Ver clasificación y estadísticas de su torneo
- Registrar resultados de partidos (al igual que árbitros y super admin)

**Limitaciones:**
- Solo puede gestionar la liga específica que le asignó el Super Admin
- No puede crear ligas nuevas
- No puede gestionar canchas o unidades deportivas
- No puede ver datos de otras ligas

### 1.3 Árbitro

**Identificador:** `referee`

**Permisos:**
- Ver lista de partidos asignados a las unidades deportivas que se le asignaron
- Llenar fichas digitales de partido (asistencia, goles, faltas, observaciones)
- Registrar resultados de partidos
- Seleccionar el equipo que avanza en partidos de liguilla y copa

**Limitaciones:**
- Solo puede llenar fichas de partidos en las unidades deportivas que se le asignaron
- No puede crear o modificar equipos, jugadores o calendarios
- Una vez cerrada una ficha, no puede modificarla (solo el admin de liga o super admin)

### 1.4 Jugador

**Identificador:** `player`

**Permisos:**
- Editar su perfil personal (foto, datos, posición preferida)
- Subir foto de rostro para identificación
- Inscribirse a torneos
- Ver sus estadísticas personales
- Ver calendario y resultados de su equipo

**Limitaciones:**
- Solo puede editar sus propios datos
- Su número de afiliado es generado automáticamente y no puede modificarse
- No puede ver datos privados de otros jugadores

### 1.5 Espectador (Público)

**Identificador:** `viewer`

**Permisos:**
- Acceso público sin necesidad de iniciar sesión
- Ver unidades deportivas disponibles
- Ver torneos activos de cada unidad
- Consultar tabla de posiciones, partidos, goleadores, equipos y estadísticas (mejor ofensiva, mejor defensiva, fair play)

**Limitaciones:**
- Sin acceso a datos privados de jugadores
- No puede registrar ni modificar nada

---

## 2. Generador de calendario de partidos

### 2.1 Reglas generales

- Genera **una jornada a la vez** (no toda la temporada de golpe)
- Toma en cuenta los equipos **actualmente inscritos** al momento de generar
- Refleja altas y bajas de equipos entre jornadas automáticamente
- Todos los equipos juegan el mismo día
- En una jornada cada equipo debe tener un partido (excepto el descanso si son número non)

### 2.2 Algoritmo de emparejamiento

- Sistema **round-robin** (todos contra todos)
- Rotación basada en el número de jornada
- El primer equipo se mantiene fijo, los demás rotan

### 2.3 Regla del 75% para repetir rivales

- Antes de que un equipo repita rival, debe haber enfrentado al menos al **75% de los equipos inscritos**
- Si hay 8 equipos, un equipo debe haber enfrentado al menos a 6 antes de repetir
- El umbral se calcula automáticamente: `Math.floor(totalEquipos * 0.75)`

### 2.4 Manejo de número non de equipos

- Si el número total de equipos es impar, un equipo descansa por jornada
- El equipo que descansa se elige aleatoriamente
- La rotación garantiza que ningún equipo descanse dos veces consecutivas

### 2.5 Configuración por jornada

El admin de liga puede configurar cada jornada:
- Fecha de la jornada
- Hora de inicio del primer partido
- Número de canchas simultáneas (1, 2, 3 o 4)
- Duración de cada partido (20-90 minutos, ajustable cada 5)
- Tiempo entre partidos (0-30 minutos, ajustable cada 5)

### 2.6 Asignación de horarios y canchas

- Los partidos se distribuyen entre las canchas disponibles
- El cálculo del horario es: `hora_inicio + (turno × (duración + intervalo))`
- Ejemplo: con 2 canchas y 50min + 10min intervalo, los partidos son a las 8:00, 8:00, 9:00, 9:00, 10:00, 10:00

### 2.7 Vista previa antes de guardar

- Antes de guardar, muestra los partidos organizados por cancha con horarios
- Permite descartar y regenerar
- Al guardar, crea las jornadas y partidos en la base de datos

---

## 3. Sistema de Liguilla y Copa

### 3.1 Generación

- Botón separado en el panel del Admin de Liga: "Generar Liguilla y Copa"
- Toma la **tabla actualizada** en el momento que se presiona
- Asigna automáticamente los cruces de cuartos de final

### 3.2 Liguilla (Top 8 de la tabla)

**Cuartos de final:**
- 1° vs 8°
- 2° vs 7°
- 3° vs 6°
- 4° vs 5°

**Semifinales:**
- Se juegan la siguiente jornada con los ganadores de cuartos
- Los cruces se determinan al registrar resultados de cuartos

**Final y 3er lugar:**
- La gran final la juegan los ganadores de semifinales
- El partido por el 3er lugar lo juegan los **perdedores de la semifinal**
- Se juegan en la misma jornada (la última)

### 3.3 Copa (lugares 9-16)

**Cuartos de final:**
- 9° vs 16°
- 10° vs 15°
- 11° vs 14°
- 12° vs 13°

**Semifinales:**
- Se juegan la siguiente jornada con los ganadores de cuartos

**Final y 3er lugar:**
- La gran final la juegan los ganadores de semifinales
- El partido por el 3er lugar lo juegan los **perdedores de la semifinal**

### 3.4 Equipos sobrantes (más de 16 equipos)

- Si hay más de 16 equipos inscritos, los lugares 17 en adelante juegan **partidos amistosos**
- Los amistosos se asignan automáticamente: 17 vs 18, 19 vs 20, etc.

### 3.5 Modalidad de partidos

- Todas las rondas clasificatorias son a **partido único** (sin ida y vuelta)

### 3.6 Registro de resultados de liguilla y copa

- Pueden registrarlos: Árbitro, Admin de Liga y Super Admin
- Además del marcador, debe seleccionarse manualmente **qué equipo avanza**
- En caso de empate, el admin elige manualmente quién pasa
- Esto aplica en cuartos, semis y final

### 3.7 Bracket visual

- Pestaña separada llamada "Clasificación" en la vista pública de la unidad deportiva
- Diagrama tipo árbol que muestra: Cuartos → Semis → Final + 3er lugar
- Se actualiza en tiempo real conforme se registran resultados
- Separado en dos secciones: Liguilla y Copa
- Los partidos también aparecen en la pestaña "Partidos" regular

---

## 4. Equipos y jugadores

### 4.1 Número máximo de jugadores por equipo

- **Máximo 17 jugadores por equipo** (definido en la ficha física de partido)
- En la ficha de papel siempre se muestran las 17 filas, las vacías se dejan en blanco para que en cancha puedan registrar a un jugador nuevo que se presente por primera vez

### 4.2 Datos del equipo

- Nombre
- Escudo (imagen subida)
- Color de playera
- Liga a la que pertenece

### 4.3 Datos del jugador

- Nombre completo
- Foto de rostro (obligatoria)
- Fecha de nacimiento
- Domicilio
- Posición preferida (Portero, Defensa, Mediocampista, Delantero)
- Número en camiseta (1-99)
- Nombre al reverso de la camiseta (en mayúsculas)
- Número de afiliado (generado automáticamente con formato AF-00001, AF-00002, etc.)
- Email y contraseña (para iniciar sesión)

### 4.4 Restricción de inscripción

- Un jugador solo puede estar inscrito en un equipo por liga
- Restricción técnica: `UNIQUE(jugador_id, liga_id)` en la tabla `jugador_equipo`

---

## 5. Flujo de solicitudes de registro

### 5.1 Para jugadores

- Se registran directamente desde un modal en la página principal
- Llenan sus datos personales y crean su contraseña
- Se les asigna automáticamente un número de afiliado
- **No requieren aprobación** del Super Admin
- Al confirmar el correo (si está activado) ya pueden iniciar sesión

### 5.2 Para árbitros y admins de liga

**Paso 1 — Solicitud:**
- Llenan un modal de "Solicitud de registro"
- Eligen entre Árbitro o Admin de Liga
- Proporcionan nombre, correo y contraseña
- Su solicitud se guarda con estado "pendiente"

**Paso 2 — Notificación al Super Admin:**
- La solicitud aparece en la pestaña "Solicitudes" del panel de Super Admin
- Se muestra: nombre, tipo de rol, correo, fecha, estado

**Paso 3 — Revisión:**
- Filtros disponibles: Pendientes, Aprobadas, Rechazadas, Todas
- Cada solicitud muestra botones de Aprobar y Rechazar

**Paso 4A — Aprobación de Árbitro:**
- Se abre modal donde el Super Admin debe seleccionar **una o más unidades deportivas** mediante checkboxes
- Validación: debe seleccionar al menos una unidad
- Al confirmar, se asigna el rol y se guarda la relación árbitro-cancha en la tabla `arbitro_cancha`

**Paso 4B — Aprobación de Admin de Liga:**
- Se abre modal donde el Super Admin debe seleccionar la **liga específica** que administrará
- Validación: debe seleccionar una liga
- Al confirmar, se asigna el rol con la liga vinculada

**Paso 5 — Rechazo:**
- Pide confirmación antes de rechazar
- Marca la solicitud como "rechazado" pero no elimina al usuario

### 5.3 Estados de las solicitudes

- `pendiente` — esperando revisión
- `aprobado` — aprobado y rol asignado
- `rechazado` — rechazado por el admin

---

## 6. Generador de fichas de partido

### 6.1 Doble propósito

La ficha tiene dos usos principales:
1. **Versión imprimible (PDF)** — para que el árbitro la lleve impresa al partido y la llene a mano
2. **Versión digital interactiva** — para que el árbitro la llene desde la página con clicks/touches sencillos

### 6.2 Especificaciones del PDF imprimible

**Formato:** una hoja tamaño carta lista para imprimir

**Encabezado (de izquierda a derecha):**
- Logo de la unidad deportiva (campo a agregar a la BD posteriormente)
- Nombre de la unidad deportiva (texto pequeño arriba)
- Nombre del torneo (texto principal)
- Centro: Jornada, fecha completa, hora y cancha
- Derecha: Logo de IFútbol + nombre "IFútbol"

**Marcador central:**
- Nombre del primer equipo
- Cuadrado para marcador local (en blanco)
- Separador ":"
- Cuadrado para marcador visitante (en blanco)
- Nombre del segundo equipo

**Sección de equipos (lado a lado):**
- Equipo A en columna izquierda
- Equipo B en columna derecha
- Cada equipo muestra: escudo + nombre del equipo
- **No se usan los términos "local" o "visitante" textualmente** (todos juegan en la misma cancha)

**Lista de jugadores por equipo (siempre 17 filas):**
Cada fila contiene:
- Foto del jugador (círculo)
- Nombre completo
- Nombre en camiseta
- Número de jugador (#)
- Número de afiliado (AF-XXXXX)
- Casilla de asistencia (☐)
- Casilla de goles (cuadrito numérico)

Si el equipo tiene menos de 17 jugadores, las filas restantes quedan en blanco para anotar manualmente jugadores nuevos que se presenten en cancha.

**Faltas por equipo:**
- Cuadrito al final de cada lista de equipo para anotar el total de faltas cometidas

**Pie de ficha (ancho completo):**
- Apartado de Observaciones — espacio amplio que va de extremo a extremo
- Línea para nombre del árbitro
- Línea para firma del árbitro

### 6.3 Especificaciones de la versión digital interactiva

- Diseño idéntico o muy similar al PDF
- Casilla de asistencia: tap/click para marcar presente o ausente
- Goles: tap/click para sumar goles a cada jugador
- Marcador final: editable directamente
- Faltas por equipo: editable
- Observaciones: campo de texto
- Botón para cerrar ficha (una vez cerrada queda registrada en estadísticas)

### 6.4 Quién puede llenar la ficha

- Árbitro asignado al partido
- Admin de Liga
- Super Admin

### 6.5 Datos que se calculan a partir de las fichas

- Tabla de posiciones (puntos, partidos jugados, ganados, empatados, perdidos, goles a favor, goles en contra)
- Goleadores individuales
- Mejor ofensiva (promedio de goles anotados por partido)
- Mejor defensiva (promedio de goles concedidos por partido)
- Fair Play (promedio de faltas cometidas por partido)
- Asistencia de jugadores

---

## 7. Modelo de cobro y planes

### 7.1 Sistema de cobro

- El cobro es **por torneo** (no por unidad deportiva ni por mes)
- Se cobra **por semana jugada**
- Las semanas de Liguilla y Copa también se cobran (3 semanas extra)
- Una temporada típica son 23 semanas (20 regulares + 3 de liguilla)

### 7.2 Plan Básico

- **Precio normal:** $89 MXN/semana
- **Precio lanzamiento:** $89 MXN/semana
- Hasta 10 equipos
- Hasta 150 jugadores
- 1 torneo
- Incluye: tabla de posiciones, calendario, fichas digitales, registro de jugadores, perfil público

### 7.3 Plan Estándar

- **Precio normal:** $129 MXN/semana
- **Precio lanzamiento:** $89 MXN/semana
- Hasta 20 equipos
- Hasta 300 jugadores
- Incluye lo del Básico + Liguilla y Copa, estadísticas avanzadas, escudos de equipos, foto de jugadores, generador de fichas PDF

### 7.4 Plan Pro

- **Precio normal:** $179 MXN/semana
- **Precio lanzamiento:** $129 MXN/semana
- Equipos ilimitados
- Jugadores ilimitados
- Incluye todo lo del Estándar + soporte prioritario, estadísticas históricas entre temporadas, personalización del perfil de la unidad deportiva

### 7.5 Estrategia de lanzamiento

- Durante el primer lanzamiento, cada plan se cobra al precio del plan inmediatamente inferior durante 13 semanas
- Estrategia de price anchoring: el cliente percibe que está obteniendo más valor al mismo precio

### 7.6 Si una unidad deportiva tiene varios torneos

- Se cobra cada torneo de forma independiente según el número de equipos que tenga
- Ejemplo: una unidad con 3 torneos (18, 9 y 25 equipos) pagaría: Estándar + Básico + Pro

### 7.7 Cobro

- Cobro anticipado por temporada (no semana a semana)
- Al inicio de temporada se cobran las 20 semanas regulares
- Al inicio de la liguilla se cobran las 3 semanas extra

### 7.8 Costos operativos

- Supabase Free: $0 (suficiente para la fase de construcción y el primer cliente)
- Supabase Pro: $25 USD/mes (~$500 MXN/mes) — necesario al tener varios clientes
- Vercel hosting: $0 (gratis)
- Dominio ifutbol.lat: $1.80 USD/año (Namecheap, primer año con descuento)

---

## 8. Validaciones y reglas técnicas

### 8.1 Restricciones de inscripción

- Un jugador no puede estar en dos equipos de la misma liga
- Un usuario solo tiene un rol asignado
- El número de afiliado es único e irreversible

### 8.2 Estado del torneo

- Tabla `torneo_estado` rastrea la fase actual: `regular`, `liguilla`, `finalizado`
- Permite saber en qué jornada está cada torneo

### 8.3 Historial de enfrentamientos

- Tabla `historial_enfrentamientos` registra todos los partidos jugados
- Se usa para aplicar la regla del 75% al generar nuevas jornadas

### 8.4 Cierre de fichas

- Una ficha tiene estado `cerrada` (booleano)
- Solo las fichas cerradas se cuentan para estadísticas
- Una vez cerrada, solo Admin de Liga o Super Admin pueden modificarla

### 8.5 Confirmación de correo

- Durante desarrollo: desactivada para facilitar pruebas
- En producción: debe reactivarse para mayor seguridad
