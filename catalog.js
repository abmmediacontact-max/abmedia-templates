/*
 * Catálogo de secuencias predefinidas por objetivo (categoría).
 * Cada slide usa el modelo de párrafos con marcas inline editables:
 *   ==resaltado==   __subrayado__   **acento**
 */

const CATEGORIES = {
  ventas:    { name: "Ventas",     emoji: "💰", desc: "Vender, lanzar ofertas y cerrar plazas." },
  autoridad: { name: "Autoridad",  emoji: "👑", desc: "Resultados, historia y credibilidad." },
  valor:     { name: "Valor",      emoji: "💡", desc: "Enseñar, dar tips y aportar." },
  recursos:  { name: "Recursos",   emoji: "🎁", desc: "Guías, plantillas y lead magnets." },
  lifestyle: { name: "Día a día",  emoji: "☕", desc: "Detrás de cámaras y cercanía." }
};

const CATALOG = [
  /* ----------------------------- VENTAS ------------------------------- */
  {
    id: "v-oferta", category: "ventas", title: "Lanzamiento de oferta",
    objective: "Presentar una oferta y empujar a la compra.",
    slides: [
      { vpos: "bottom", overlay: "bottom", body: "Llevo semanas preparando esto.\n\nHoy abro ==plazas== y quiero que entres tú." },
      { vpos: "center", overlay: "full", body: "Esto es lo que te llevas:\n\n__Formación + acompañamiento + comunidad__.\n\nTodo lo que necesitas para empezar." },
      { vpos: "bottom", overlay: "bottom", body: "Solo durante esta semana.\n\n**Comenta \"QUIERO\" y te paso el acceso.**" }
    ]
  },
  {
    id: "v-urgencia", category: "ventas", title: "Urgencia / Cuenta atrás",
    objective: "Crear urgencia el último día de una oferta.",
    slides: [
      { vpos: "center", overlay: "full", body: "==ÚLTIMO DÍA==\n\nA medianoche sube el precio y no vuelve a bajar." },
      { vpos: "bottom", overlay: "bottom", body: "Si llevas días dándole vueltas, __esta es la señal__.\n\nNo te quedes fuera." },
      { vpos: "bottom", overlay: "bottom", body: "**Desliza hacia arriba y entra ahora.**" }
    ]
  },
  {
    id: "v-objeciones", category: "ventas", title: "Rompe objeciones",
    objective: "Resolver las dudas que frenan la compra.",
    slides: [
      { vpos: "center", overlay: "full", body: "¿Lo estás pensando?\n\nDéjame quitarte ==3 dudas== de encima." },
      { vpos: "center", overlay: "full", body: "\"No tengo tiempo\"\n\n→ está diseñado para gente ocupada. __20 min al día__." },
      { vpos: "center", overlay: "full", body: "\"Es caro\"\n\n→ calcula lo que te cuesta **NO** hacerlo." },
      { vpos: "bottom", overlay: "bottom", body: "\"¿Y si no funciona?\"\n\n→ tienes ==garantía== y soporte directo." }
    ]
  },

  /* ---------------------------- AUTORIDAD ----------------------------- */
  {
    id: "a-historia", category: "autoridad", title: "Mi historia / Origen",
    objective: "Conectar contando de dónde vienes.",
    slides: [
      { vpos: "bottom", overlay: "bottom", body: "Antes de todo esto, yo también ==empecé de cero==." },
      { vpos: "center", overlay: "full", body: "Hubo un momento en el que casi lo dejo.\n\n__Me alegro de no haberlo hecho.__" },
      { vpos: "bottom", overlay: "bottom", body: "Si estás empezando, este mensaje es para ti.\n\n**Sigue.**" }
    ]
  },
  {
    id: "a-resultado", category: "autoridad", title: "Resultado de cliente",
    objective: "Mostrar un caso real para generar confianza.",
    slides: [
      { vpos: "bottom", overlay: "bottom", body: "Quiero enseñarte algo que pasó este mes." },
      { vpos: "center", overlay: "full", body: "\"En 60 días pasé de no tener clientes a tener ==lista de espera==.\"\n\n— Cliente de ABMedia" },
      { vpos: "bottom", overlay: "bottom", body: "No es suerte. Es __un sistema__.\n\n**Te lo cuento por DM.**" }
    ]
  },
  {
    id: "a-cifra", category: "autoridad", title: "Cifra de autoridad",
    objective: "Demostrar resultados con datos.",
    slides: [
      { vpos: "center", overlay: "full", body: "Los resultados hablan mejor que yo." },
      { vpos: "center", overlay: "full", body: "==+200 personas== ya han pasado por el programa.\n\nY los números siguen subiendo." },
      { vpos: "bottom", overlay: "bottom", body: "¿Quieres ser el siguiente?\n\n**Comenta \"INFO\".**" }
    ]
  },

  /* ------------------------------ VALOR ------------------------------- */
  {
    id: "val-tips", category: "valor", title: "3 consejos rápidos",
    objective: "Aportar valor accionable en segundos.",
    slides: [
      { vpos: "center", overlay: "full", body: "==3 claves== que deberías aplicar ya 👇" },
      { vpos: "center", overlay: "full", body: "1. __Primera clave__\n\nExplica aquí por qué importa." },
      { vpos: "center", overlay: "full", body: "2. __Segunda clave__\n\nExplica aquí por qué importa." },
      { vpos: "bottom", overlay: "bottom", body: "3. __Tercera clave__\n\n**Guarda esto para no olvidarlo.**" }
    ]
  },
  {
    id: "val-error", category: "valor", title: "El error común",
    objective: "Señalar un error frecuente y cómo evitarlo.",
    slides: [
      { vpos: "center", overlay: "full", body: "El error que ==casi todos cometen== sin darse cuenta." },
      { vpos: "center", overlay: "full", body: "Crees que el problema es X.\n\n__Pero en realidad es otra cosa.__" },
      { vpos: "bottom", overlay: "bottom", body: "Corrige esto y todo cambia.\n\n**Sigue para más.**" }
    ]
  },
  {
    id: "val-pasos", category: "valor", title: "Mini guía paso a paso",
    objective: "Enseñar un proceso simple en pasos.",
    slides: [
      { vpos: "center", overlay: "full", body: "Cómo hacerlo en ==3 pasos==." },
      { vpos: "center", overlay: "full", body: "Paso 1 → __primer paso del proceso__." },
      { vpos: "center", overlay: "full", body: "Paso 2 → __segundo paso del proceso__." },
      { vpos: "bottom", overlay: "bottom", body: "Paso 3 → __tercer paso del proceso__.\n\n**Aplícalo hoy.**" }
    ]
  },

  /* ----------------------------- RECURSOS ----------------------------- */
  {
    id: "r-gratis", category: "recursos", title: "Recurso gratuito",
    objective: "Regalar una guía a cambio de contacto.",
    slides: [
      { vpos: "center", overlay: "full", body: "He preparado una ==guía gratuita==.\n\nY hoy te la regalo." },
      { vpos: "center", overlay: "full", body: "Dentro tienes lo que normalmente __cobro en sesiones__." },
      { vpos: "bottom", overlay: "bottom", body: "**Comenta \"GUÍA\" y te la mando.**" }
    ]
  },
  {
    id: "r-checklist", category: "recursos", title: "Checklist descargable",
    objective: "Ofrecer un checklist como recurso rápido.",
    slides: [
      { vpos: "center", overlay: "full", body: "Una ==checklist== para que no se te escape nada." },
      { vpos: "bottom", overlay: "bottom", body: "**Pídemela por DM 📩**" }
    ]
  },

  /* ---------------------------- LIFESTYLE ----------------------------- */
  {
    id: "l-bts", category: "lifestyle", title: "Detrás de cámaras",
    objective: "Mostrar el día a día y humanizar tu marca.",
    slides: [
      { vpos: "bottom", overlay: "bottom", body: "Así es un ==día normal== por aquí." },
      { vpos: "bottom", overlay: "bottom", body: "Lo que no se ve en el feed.\n\n__El trabajo de verdad.__" }
    ]
  },
  {
    id: "l-dia", category: "lifestyle", title: "Un día en mi vida",
    objective: "Contar tu rutina conectando con tu audiencia.",
    slides: [
      { vpos: "center", overlay: "full", body: "Un vistazo a ==cómo trabajo==." },
      { vpos: "center", overlay: "full", body: "AM → cómo empiezo la mañana." },
      { vpos: "center", overlay: "full", body: "PM → lo que ocupa mi tarde." },
      { vpos: "bottom", overlay: "bottom", body: "Y mi __momento favorito__ del día." }
    ]
  },
  {
    id: "l-reflexion", category: "lifestyle", title: "Reflexión",
    objective: "Compartir una reflexión que genere cercanía.",
    slides: [
      { vpos: "center", overlay: "soft", body: "Algo que he ==aprendido== esta semana." },
      { vpos: "bottom", overlay: "bottom", body: "**¿Te ha pasado? Cuéntame 👇**" }
    ]
  }
];
