/*
 * Catálogo de secuencias predefinidas, organizadas por objetivo (categoría).
 *
 * Cada entrada usa una de las plantillas/maquetas de templates.js (layout)
 * y le aplica unos textos por defecto (presets) por slide.
 * presets: { <índiceDeSlide>: { <idTexto>: "valor" } }
 */

const CATEGORIES = {
  ventas:    { name: "Ventas",     emoji: "💰", desc: "Para vender, lanzar ofertas y cerrar plazas." },
  autoridad: { name: "Autoridad",  emoji: "👑", desc: "Para mostrar resultados, historia y credibilidad." },
  valor:     { name: "Valor",      emoji: "💡", desc: "Para enseñar, dar tips y aportar contenido útil." },
  recursos:  { name: "Recursos",   emoji: "🎁", desc: "Para regalar guías, plantillas y lead magnets." },
  lifestyle: { name: "Día a día",  emoji: "☕", desc: "Para mostrar el detrás de cámaras y conectar." }
};

const CATALOG = [
  /* ----------------------------- VENTAS ------------------------------- */
  {
    id: "v-oferta", category: "ventas", layout: "promo",
    title: "Lanzamiento de oferta",
    objective: "Presentar una oferta y empujar a la compra.",
    presets: {
      0: { badge: "OFERTA", title: "ÚLTIMAS\nPLAZAS", subtitle: "Solo durante esta semana" },
      1: { eyebrow: "QUÉ INCLUYE", headline: "Todo lo que te llevas al entrar", detail: "Formación + acompañamiento + comunidad" },
      2: { price: "-40%", cta: "Reserva tu plaza ↑" }
    }
  },
  {
    id: "v-urgencia", category: "ventas", layout: "promo",
    title: "Urgencia / Cuenta atrás",
    objective: "Crear urgencia el último día de una oferta.",
    presets: {
      0: { badge: "ÚLTIMO DÍA", title: "SE\nACABA HOY", subtitle: "A medianoche sube el precio" },
      1: { eyebrow: "NO LO DEJES PASAR", headline: "Esta es tu última oportunidad a este precio", detail: "Después vuelve a tarifa completa" },
      2: { price: "HOY", cta: "Entra ahora ↑" }
    }
  },
  {
    id: "v-objeciones", category: "ventas", layout: "tips",
    title: "Rompe objeciones",
    objective: "Resolver las dudas que frenan la compra.",
    presets: {
      0: { kicker: "¿LO ESTÁS PENSANDO?", title: "3 razones para no esperar más" },
      1: { num: "01", tip: "“No tengo tiempo” → está diseñado para gente ocupada" },
      2: { num: "02", tip: "“Es caro” → calcula lo que te cuesta NO hacerlo" },
      3: { num: "03", tip: "“¿Y si no funciona?” → tienes garantía y soporte" }
    }
  },

  /* ---------------------------- AUTORIDAD ----------------------------- */
  {
    id: "a-historia", category: "autoridad", layout: "minimal",
    title: "Mi historia / Origen",
    objective: "Conectar contando de dónde vienes.",
    presets: {
      0: { title: "Antes de esto, también empecé de cero" },
      1: { cta: "Te cuento cómo cambió todo →" }
    }
  },
  {
    id: "a-resultado", category: "autoridad", layout: "testimonio",
    title: "Resultado de cliente",
    objective: "Mostrar un caso real para generar confianza.",
    presets: {
      0: { label: "CASO REAL", sub: "Un cliente que aplicó el método" },
      1: { quote: "“En 60 días pasé de no tener clientes a tener lista de espera.”", author: "— Cliente de ABMedia" },
      2: { stars: "★★★★★", cta: "Tú puedes ser el siguiente" }
    }
  },
  {
    id: "a-cifra", category: "autoridad", layout: "dato",
    title: "Cifra de autoridad",
    objective: "Demostrar resultados con un número potente.",
    presets: {
      0: { kicker: "EN NÚMEROS", hook: "Los resultados hablan mejor que yo" },
      1: { number: "+200", context: "personas ya han pasado por el programa" },
      2: { takeaway: "No es suerte, es un sistema", cta: "Descúbrelo ↑" }
    }
  },

  /* ------------------------------ VALOR ------------------------------- */
  {
    id: "val-tips", category: "valor", layout: "tips",
    title: "3 consejos rápidos",
    objective: "Aportar valor accionable en segundos.",
    presets: {
      0: { kicker: "GUÍA RÁPIDA", title: "3 claves que deberías aplicar ya" },
      1: { num: "01", tip: "Escribe aquí tu primera clave" },
      2: { num: "02", tip: "Escribe aquí tu segunda clave" },
      3: { num: "03", tip: "Escribe aquí tu tercera clave" }
    }
  },
  {
    id: "val-error", category: "valor", layout: "dato",
    title: "El error común",
    objective: "Señalar un error frecuente y cómo evitarlo.",
    presets: {
      0: { kicker: "OJO CON ESTO", hook: "El error que casi todos cometen" },
      1: { number: "#1", context: "razón por la que no avanzas" },
      2: { takeaway: "Corrige esto y todo cambia", cta: "Sigue para más ↑" }
    }
  },
  {
    id: "val-pasos", category: "valor", layout: "tips",
    title: "Mini guía paso a paso",
    objective: "Enseñar un proceso simple en pasos.",
    presets: {
      0: { kicker: "PASO A PASO", title: "Cómo hacerlo en 3 pasos" },
      1: { num: "01", tip: "Primer paso del proceso" },
      2: { num: "02", tip: "Segundo paso del proceso" },
      3: { num: "03", tip: "Tercer paso del proceso" }
    }
  },

  /* ----------------------------- RECURSOS ----------------------------- */
  {
    id: "r-gratis", category: "recursos", layout: "promo",
    title: "Recurso gratuito",
    objective: "Regalar una guía a cambio de contacto/seguimiento.",
    presets: {
      0: { badge: "GRATIS", title: "GUÍA\nGRATUITA", subtitle: "Descárgala en 1 clic" },
      1: { eyebrow: "QUÉ APRENDERÁS", headline: "Lo que normalmente cobro, hoy gratis", detail: "Aplicable desde el primer día" },
      2: { price: "0€", cta: "Descárgala ↑" }
    }
  },
  {
    id: "r-checklist", category: "recursos", layout: "minimal",
    title: "Checklist descargable",
    objective: "Ofrecer un checklist como recurso rápido.",
    presets: {
      0: { title: "Checklist gratis para que no se te escape nada" },
      1: { cta: "Pídemela por DM 📩" }
    }
  },

  /* ---------------------------- LIFESTYLE ----------------------------- */
  {
    id: "l-bts", category: "lifestyle", layout: "minimal",
    title: "Detrás de cámaras",
    objective: "Mostrar el día a día y humanizar tu marca.",
    presets: {
      0: { title: "Así es un día normal por aquí" },
      1: { cta: "@abmedia" }
    }
  },
  {
    id: "l-dia", category: "lifestyle", layout: "tips",
    title: "Un día en mi vida",
    objective: "Contar tu rutina conectando con tu audiencia.",
    presets: {
      0: { kicker: "DÍA A DÍA", title: "Un vistazo a cómo trabajo" },
      1: { num: "AM", tip: "Cómo empiezo la mañana" },
      2: { num: "PM", tip: "Lo que ocupa mi tarde" },
      3: { num: "★", tip: "El momento favorito del día" }
    }
  },
  {
    id: "l-reflexion", category: "lifestyle", layout: "minimal",
    title: "Reflexión",
    objective: "Compartir una reflexión que genere cercanía.",
    presets: {
      0: { title: "Algo que he aprendido esta semana" },
      1: { cta: "¿Te ha pasado? Cuéntame 👇" }
    }
  }
];
