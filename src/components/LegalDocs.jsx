import { useState } from "react";

// ─────────────────────────────────────────────────────────────────
// DOCUMENTOS LEGALES (Aviso de Privacidad + Términos y Condiciones)
//
// El contenido vive aquí como datos para renderizarse dentro de un modal
// (sin sacar al usuario del registro) y desde el footer público. La fuente
// editorial completa también está en AVISO_DE_PRIVACIDAD.md y
// TERMINOS_Y_CONDICIONES.md en la raíz del proyecto.
//
// LEGAL_VERSION: fecha de la versión vigente. Se guarda junto al
// consentimiento del usuario (acepto_terminos_at) para trazabilidad.
// ─────────────────────────────────────────────────────────────────
export const LEGAL_VERSION = "2026-06-14";

// Bloques: { h } encabezado, { p } párrafo, { ul } lista. El render soporta
// **negritas** dentro de p/ul con un parser mínimo.
const PRIVACIDAD = {
  titulo: "Aviso de Privacidad",
  actualizado: "14 de junio de 2026",
  bloques: [
    { p: "En cumplimiento de la **Ley Federal de Protección de Datos Personales en Posesión de los Particulares** (la \"Ley\"), su Reglamento y demás disposiciones aplicables en México, ponemos a su disposición el presente Aviso de Privacidad." },
    { h: "1. Identidad y domicilio del Responsable" },
    { p: "El responsable del tratamiento de sus datos personales es **Alonso Conchas**, persona física que opera bajo el nombre comercial **iFutbol**, con domicilio en **Tonalá, Jalisco, México**, y correo de contacto **alonsoconchas803@gmail.com**." },
    { h: "2. Datos personales que recabamos" },
    { p: "De los **jugadores**: nombre completo, fecha de nacimiento, domicilio, correo electrónico, fotografía (imagen de rostro) e información deportiva (posición preferida, número/dorsal y nombre de camiseta)." },
    { p: "Del **personal de las unidades deportivas** (administradores y árbitros): nombre completo y correo electrónico." },
    { p: "**Datos de cuenta**: correo y contraseña, o los datos básicos de su cuenta de Google si inicia sesión con dicho proveedor." },
    { p: "iFutbol no recaba datos personales sensibles, financieros ni patrimoniales de los jugadores." },
    { h: "3. Finalidades del tratamiento" },
    { p: "**Finalidades primarias** (necesarias para el servicio):" },
    { ul: [
      "Crear, administrar y autenticar su cuenta.",
      "Gestionar inscripciones de jugadores a equipos, ligas y torneos.",
      "Generar calendarios, fichas de partido, resultados, estadísticas y clasificaciones.",
      "Mostrar su perfil dentro de la Plataforma a las personas autorizadas de su liga o unidad.",
      "Mostrar de forma pública su fotografía y su nombre de camiseta. Su nombre real no se muestra públicamente.",
      "Brindar soporte y comunicarle información operativa del servicio.",
    ] },
    { p: "**Finalidades secundarias** (no necesarias), en caso de habilitarse a futuro: enviarle promociones y novedades, y realizar analítica de uso para mejorar el servicio. Si no desea estas finalidades, escríbanos a alonsoconchas803@gmail.com; su negativa no condiciona el servicio." },
    { h: "4. Transferencias y encargados" },
    { p: "Utilizamos proveedores que pueden procesar datos fuera de México (incluido EE. UU.): **Supabase** (base de datos y autenticación), **Google** (inicio de sesión) y **Resend** (envío de correos). Tratan los datos solo por cuenta de iFutbol. No vendemos ni transferimos sus datos a terceros con fines comerciales." },
    { h: "5. Derechos ARCO" },
    { p: "Usted puede **Acceder, Rectificar, Cancelar u Oponerse** al tratamiento de sus datos enviando una solicitud a **alonsoconchas803@gmail.com**, indicando su nombre, medio de contacto, identificación y la descripción de su solicitud." },
    { h: "6. Revocación del consentimiento" },
    { p: "Puede revocar su consentimiento en cualquier momento escribiendo al mismo correo. La revocación puede impedir que sigamos prestándole el servicio cuando el tratamiento sea indispensable." },
    { h: "7. Conservación y cookies" },
    { p: "Conservamos sus datos mientras su cuenta esté activa y durante los plazos legales aplicables. La Plataforma usa cookies y almacenamiento local estrictamente necesarios para mantener su sesión." },
    { h: "8. Mayoría de edad" },
    { p: "La Plataforma está dirigida a personas mayores de edad. Al registrarse, usted **declara ser mayor de 18 años** y que su información es veraz." },
    { h: "9. Cambios al Aviso" },
    { p: "Este Aviso puede modificarse; las actualizaciones se publicarán en www.ifutbol.lat indicando la fecha de la última versión." },
  ],
};

const TERMINOS = {
  titulo: "Términos y Condiciones de Uso",
  actualizado: "14 de junio de 2026",
  bloques: [
    { p: "Estos Términos regulan el uso de la plataforma **iFutbol** (www.ifutbol.lat), operada por **Alonso Conchas**, persona física con domicilio en **Tonalá, Jalisco, México**. Al registrarse o usar la Plataforma, usted acepta estos Términos en su totalidad." },
    { h: "1. Objeto del servicio" },
    { p: "iFutbol es una **herramienta de software de gestión deportiva**: permite organizar ligas y torneos, inscribir equipos y jugadores, generar calendarios y fichas, capturar resultados y consultar estadísticas. **iFutbol no organiza, dirige ni participa físicamente** en los partidos." },
    { h: "2. Tipos de usuario y acceso" },
    { p: "El uso es **completamente gratuito para jugadores y árbitros**. El acceso es **contratado y pagado por la unidad deportiva o liga** correspondiente, que habilita a sus jugadores y árbitros." },
    { h: "3. Registro y cuenta" },
    { p: "Debe proporcionar información veraz y completa. Al registrarse, **declara ser mayor de 18 años**. Es responsable de la confidencialidad de su contraseña y de la actividad de su cuenta. El tratamiento de sus datos se rige por el Aviso de Privacidad." },
    { h: "4. Contratación, pagos y cancelación" },
    { p: "El servicio se presta a las unidades bajo **modalidad de suscripción**, cuyos términos, periodicidad y precio se rigen por el **contrato específico** con cada unidad. iFutbol podrá ofrecer un **torneo o periodo de prueba gratuito**; la unidad decide cuándo inicia y concluye su uso conforme a la cláusula de cancelación de su contrato. **No existen reembolsos**, salvo que el contrato disponga lo contrario." },
    { h: "5. Uso aceptable" },
    { ul: [
      "Usar la Plataforma conforme a estos Términos y a la ley.",
      "No suplantar identidades ni proporcionar información falsa.",
      "No introducir contenido ilícito, ofensivo o que vulnere derechos de terceros.",
      "No vulnerar la seguridad de la Plataforma ni interferir con su funcionamiento.",
    ] },
    { h: "6. Contenido del usuario" },
    { p: "Usted es responsable de la información e imágenes que carga, incluida su fotografía, y garantiza tener derecho a hacerlo. Autoriza que su **fotografía** y su **nombre de camiseta** se muestren en las vistas públicas de la Plataforma. **El nombre real del jugador no se muestra públicamente.**" },
    { h: "7. Propiedad intelectual" },
    { p: "La Plataforma, su código, diseño, marca y logotipos son propiedad de iFutbol o de sus titulares. Se concede al usuario una licencia limitada, personal e intransferible de uso." },
    { h: "8. Limitación de responsabilidad" },
    { p: "iFutbol **no será responsable de lesiones, accidentes, daños o conflictos ocurridos durante los partidos o eventos deportivos**, que se celebran bajo responsabilidad exclusiva de las unidades deportivas y los participantes. La Plataforma se ofrece \"tal cual\" y \"según disponibilidad\", sin garantía de funcionamiento ininterrumpido. iFutbol no responde por daños indirectos ni por la veracidad de la información cargada por los usuarios." },
    { h: "9. Suspensión y terminación" },
    { p: "Podemos realizar mantenimiento que afecte temporalmente la disponibilidad, y suspender o cancelar cuentas que incumplan estos Términos." },
    { h: "10. Modificaciones" },
    { p: "iFutbol podrá modificar estos Términos; las actualizaciones se publicarán en la Plataforma. El uso continuado implica su aceptación." },
    { h: "11. Ley aplicable y jurisdicción" },
    { p: "Estos Términos se rigen por las leyes de México. Para su interpretación y cumplimiento, las partes se someten a los **tribunales competentes del Estado de Jalisco**, renunciando a cualquier otro fuero." },
    { h: "12. Contacto" },
    { p: "Dudas sobre estos Términos: **alonsoconchas803@gmail.com**." },
  ],
};

const DOCS = { privacidad: PRIVACIDAD, terminos: TERMINOS };

// Parser mínimo de **negritas** → <strong>
function conNegritas(texto) {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
    parte.startsWith("**") && parte.endsWith("**")
      ? <strong key={i}>{parte.slice(2, -2)}</strong>
      : parte
  );
}

// ─────────────────────────────────────────────────────────────────
// MODAL VISOR DE UN DOCUMENTO LEGAL
// doc: "privacidad" | "terminos"
// ─────────────────────────────────────────────────────────────────
export function LegalModal({ doc, onClose }) {
  const data = DOCS[doc];
  if (!data) return null;
  return (
    <div className="ifutbol-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="ifutbol-modal" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column", padding: 0 }}>
        <div style={{ padding: "18px 22px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>{data.titulo}</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>Última actualización: {data.actualizado}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar"
            style={{ background: "none", border: "none", fontSize: 22, lineHeight: 1, cursor: "pointer", color: "var(--text-muted)" }}>×</button>
        </div>
        <div style={{ padding: "16px 22px 22px", overflowY: "auto", fontSize: 13.5, lineHeight: 1.55, color: "var(--text-sub)" }}>
          {data.bloques.map((b, i) => {
            if (b.h) return <h4 key={i} style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text)", margin: "16px 0 6px" }}>{b.h}</h4>;
            if (b.ul) return <ul key={i} style={{ margin: "6px 0", paddingLeft: 20 }}>{b.ul.map((li, j) => <li key={j} style={{ marginBottom: 4 }}>{conNegritas(li)}</li>)}</ul>;
            return <p key={i} style={{ margin: "0 0 8px" }}>{conNegritas(b.p)}</p>;
          })}
        </div>
        <div style={{ padding: "12px 22px", borderTop: "1px solid var(--border)" }}>
          <button className="btn btn-premium" style={{ width: "100%" }} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// CHECKBOX DE ACEPTACIÓN (con enlaces que abren el visor sin navegar)
// Úsalo en los modales de registro. Bloquea el submit hasta marcarse.
// ─────────────────────────────────────────────────────────────────
export function AceptoTerminos({ checked, onChange }) {
  const [doc, setDoc] = useState(null);
  const link = { color: "var(--green)", fontWeight: 700, cursor: "pointer", textDecoration: "underline" };
  return (
    <>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
          style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0, accentColor: "var(--green)" }} />
        <span style={{ fontSize: 12.5, color: "var(--text-sub)", lineHeight: 1.45 }}>
          He leído y acepto los{" "}
          <span style={link} onClick={e => { e.preventDefault(); setDoc("terminos"); }}>Términos y Condiciones</span>{" "}
          y el{" "}
          <span style={link} onClick={e => { e.preventDefault(); setDoc("privacidad"); }}>Aviso de Privacidad</span>, y declaro ser mayor de edad.
        </span>
      </label>
      {doc && <LegalModal doc={doc} onClose={() => setDoc(null)} />}
    </>
  );
}
