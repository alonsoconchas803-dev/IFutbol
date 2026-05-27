// Algoritmo de round-robin: genera UNA jornada respetando el historial de
// enfrentamientos. Comparte la lógica entre el generador (ScheduleGenerator) y
// la regeneración de jornadas futuras cuando un intercambio crea duplicados
// (FichaGenerator).
//
// equipos: [{ id, nombre, ... }]
// historial: { "id_a-id_b": true } — pares (claves ordenadas) ya jugados.
// numJornada: 1-indexed, define la rotación.
export function generarUnaJornada(equipos, historial, numJornada) {
  const n = equipos.length;
  const esNon = n % 2 !== 0;
  const lista = [...equipos];
  if (esNon) lista.push({ id: "BYE", nombre: "DESCANSO" });

  const total = lista.length;
  const umbral75 = Math.floor(n * 0.75);

  // Conteo de rivales únicos por equipo (para la regla del 75% que permite
  // repetir solo cuando todos los demás ya se enfrentaron suficiente).
  const conteoRivales = {};
  equipos.forEach(e => { conteoRivales[e.id] = 0; });
  Object.keys(historial).forEach(par => {
    const [a, b] = par.split("-");
    if (conteoRivales[a] !== undefined) conteoRivales[a]++;
    if (conteoRivales[b] !== undefined) conteoRivales[b]++;
  });

  // Round-robin con rotación basada en el número de jornada.
  const indices = lista.map((_, i) => i);
  const fijo = indices[0];
  const rotables = indices.slice(1);
  const rot = (numJornada - 1) % rotables.length;
  const rotados = [...rotables.slice(rot), ...rotables.slice(0, rot)];
  const orden = [fijo, ...rotados];

  const partidos = [];
  const usados = new Set();
  const descansos = [];

  for (let i = 0; i < total / 2; i++) {
    const a = lista[orden[i]];
    const b = lista[orden[total - 1 - i]];

    if (a.id === "BYE") { descansos.push(b); usados.add(b.id); continue; }
    if (b.id === "BYE") { descansos.push(a); usados.add(a.id); continue; }

    const parKey = [a.id, b.id].sort().join("-");
    const yaJugaron = historial[parKey];

    if (yaJugaron) {
      if (conteoRivales[a.id] < umbral75 || conteoRivales[b.id] < umbral75) {
        const alternativa = lista.find(e =>
          e.id !== "BYE" && !usados.has(e.id) && e.id !== a.id && e.id !== b.id &&
          !historial[[a.id, e.id].sort().join("-")]
        );
        if (alternativa) {
          partidos.push({ local: a, visitante: alternativa });
          usados.add(a.id); usados.add(alternativa.id);
          continue;
        }
      }
    }

    partidos.push({ local: a, visitante: b });
    usados.add(a.id); usados.add(b.id);
  }

  lista.forEach(e => {
    if (e.id !== "BYE" && !usados.has(e.id)) descansos.push(e);
  });

  return { partidos, descansos };
}

// Construye la clave canonica de un par (ids ordenados) para indexar historial.
export function parKey(idA, idB) {
  return [idA, idB].sort().join("-");
}
