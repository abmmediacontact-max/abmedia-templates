/*
 * Catálogo de secuencias ABMedia.
 * Cada slide usa el modelo de párrafos con marcas inline editables:
 *   ==resaltado==   __subrayado__   **acento**
 *
 * Las secuencias están organizadas en 3 categorías de uso:
 *   personal — Cercanía / lifestyle
 *   venta    — Vender / oferta / lanzamiento
 *   puente   — Lead magnets / piezas que llevan a CTA
 */

const CATEGORIES = {
  personal: {
    name: "Personal",
    emoji: "👤",
    icon: "👤",
    desc: "Cercanía y lifestyle. Conectar contando tu día a día.",
    color: "#ff6a1a"
  },
  venta: {
    name: "Venta",
    emoji: "💰",
    icon: "💰",
    desc: "Vender, abrir cupos y empujar a la compra.",
    color: "#22c55e"
  },
  puente: {
    name: "Puente",
    emoji: "🌉",
    icon: "🌉",
    desc: "Lead magnets y stories que llevan a CTA.",
    color: "#60a5fa"
  }
};

const CATALOG = [
  /* =========================== PERSONAL =========================== */
  {
    id: "p-finde", category: "personal", title: "Fin de Semana",
    objective: "Mostrar tu fin de semana y conectar con tu audiencia.",
    slides: [
      { overlay: "bottom", body: "Esto me hace conseguir ==[resultado soñado]== más que cualquier cosa…" },
      { overlay: "bottom", body: "Están siendo días de [situación] y hacer __[actividad]__ me ayuda a recargar las pilas." },
      { overlay: "bottom", body: "**Explica sobre la actividad / anécdota**\n\nUna foto + una frase corta y honesta." }
    ]
  },
  {
    id: "p-nosabeis", category: "personal", title: "No sabéis lo que…",
    objective: "Generar curiosidad sobre algo que has hecho.",
    slides: [
      { overlay: "bottom", body: "No sabéis lo que ==[actividad pasada]== [fecha concreta].\n\nPista: __no tiene nada que ver__ con [tu sector]." },
      { overlay: "bottom", body: "Comenta la actividad que hiciste, **sin entrar en detalle**." },
      { overlay: "bottom", body: "Trabajar duro está bien…\n\nPero __vivir es mejor que trabajar__.\n\nTener tiempo y estabilidad económica para disfrutar momentos así…\n\n==Todo gracias a [tu sector]==." }
    ]
  },

  /* ============================ VENTA ============================ */
  {
    id: "v-objetivos", category: "venta", title: "Objetivos 2026",
    objective: "Cerrar año y abrir oferta para el año nuevo.",
    slides: [
      { overlay: "bottom", body: "Si ==[cliente ideal]==…\n\nAtento ➡️" },
      { overlay: "full", body: "El año pasado, conseguí __[logro]__.\n\nEste año, quiero ==[nueva meta / objetivo]==." },
      { overlay: "bottom", body: "Si quieres conseguir [objetivo soñado]\n\n**Responde \"PALABRA CLAVE\"** y te lo cuento." }
    ]
  },
  {
    id: "v-siclienteideal", category: "venta", title: "Si [cliente ideal]…",
    objective: "Atrapar la atención del cliente ideal y vender.",
    slides: [
      { overlay: "bottom", body: "Si ==[cliente ideal]==…\n\nAtento ➡️" },
      { overlay: "full", body: "Muchos [cliente ideal] están dejando pasar __[resultado soñado]__ por no hacer esto:\n\n**\"[el sistema] →\"**" },
      { overlay: "bottom", body: "Si tienes [cliente ideal] y quieres ==[objetivo soñado]==\n\n**Responde \"PALABRA CLAVE\"** y te explico cómo hacerlo." }
    ]
  },
  {
    id: "v-mehedespertado", category: "venta", title: "Me he despertado así…",
    objective: "Mensaje + autoridad + sistema + CTA hacia tu VSL.",
    slides: [
      { overlay: "full", body: "\"Todas las mañanas me despierto con esto 👇\"\n\n❌ No [método común 1]\n❌ No [método común 2]\n\n✅ Solo ==[tu método]==.\n\n**ASÍ FUNCIONA →**" },
      { overlay: "full", body: "En los últimos [X] años, no he hecho más que dominar __[método o habilidad]__ que [consigue resultado].\n\nHay ==[X] sistemas== que me han permitido replicar estos resultados.\n\n**LOS [X] SISTEMAS →**" },
      { overlay: "full", body: "1: __[Nombre 1ª parte]__\n2: __[Nombre 2ª parte]__\n3: __[Nombre 3ª parte]__\n4: __[Nombre 4ª parte]__\n\n**Cómo conseguir estos Sistemas →**" },
      { overlay: "bottom", body: "He creado un vídeo de [X] minutos explicando cómo implementar estos sistemas ==en tu negocio==.\n\n**Responde \"PALABRA CLAVE\"** y te lo envío." }
    ]
  },
  {
    id: "v-comoes", category: "venta", title: "Cómo es…",
    objective: "Mostrar prueba social con testimonios + CTA.",
    slides: [
      { overlay: "bottom", body: "Oye [tu nombre / apodo], ==¿qué se siente trabajar dentro de [nombre de tu empresa]?==" },
      { overlay: "soft", body: "Testimonio 1 / resultado de cliente.\n\n__Mantén el mismo encabezado en todas.__" },
      { overlay: "soft", body: "Testimonio 2 / resultado de cliente." },
      { overlay: "soft", body: "Testimonio 3 / resultado de cliente." },
      { overlay: "soft", body: "Testimonio 4 / resultado de cliente." },
      { overlay: "bottom", body: "Responde **[keyword]** para más info." }
    ]
  },
  {
    id: "v-ampliacion", category: "venta", title: "Ampliación de cupos",
    objective: "Abrir cupos / lista de espera y empujar a inscribirse.",
    slides: [
      { overlay: "bottom", body: "Estamos abriendo nuestra ==lista de espera== para [tu oferta].\n\nAmpliamos el límite de miembros de **[X–Y]**.\n\nSi te interesa:\n• __[Característica 1]__\n• __[Característica 2]__\n• __[Característica 3]__\n\n**Responde \"PALABRA CLAVE\"** para más info." }
    ]
  },

  /* ============================ PUENTE ============================ */
  {
    id: "pu-netflix", category: "puente", title: "Netflix",
    objective: "Comparar tu lead magnet con Netflix para destacar el valor.",
    slides: [
      { overlay: "bottom", body: "==Esto es Netflix==." },
      { overlay: "bottom", body: "Y este es mi __[sistema / metodología]__ que [resultado obtenido]." },
      { overlay: "full", body: "❌ Coste: $20\n❌ Ofrece: Diversión\n❌ Valor: Perder tiempo\n\n✅ Coste: ==Gratis==\n✅ Ofrece: [Resultado soñado]\n✅ Valor: [Resultados / coste]\n\n**Responde \"PALABRA CLAVE\"** para tener [sistema]." }
    ]
  },
  {
    id: "pu-webinar", category: "puente", title: "Webinar / Directo",
    objective: "Anunciar un directo gratuito y captar registros.",
    slides: [
      { overlay: "bottom", body: "No consigues ==[Resultado soñado]==.\n\nEnumera 2 cosas que se suelen hacer y __una tercera__ que no consiga el resultado.\n\nPor eso [fecha / tiempo] voy a dar una **mentoría en directo GRATIS** 👉🏻" },
      { overlay: "bottom", body: "En esta mentoría veremos:\n\n• __Punto de dolor 1__\n• __Punto de dolor 2__\n• __[Sistema / metodología]__\n\nSi quieres acceso **responde \"PALABRA CLAVE\"** y te mando el link." }
    ]
  },
  {
    id: "pu-estrategia", category: "puente", title: "¿Quieres la estrategia completa?",
    objective: "Validar interés (encuesta) y entregar lead magnet por DM.",
    slides: [
      { overlay: "bottom", body: "¿Quieres el ==[lead magnet]== completo que me consigue [resultado cuantificable]?\n\n**Encuesta: Sí / No**" },
      { overlay: "bottom", body: "He creado un __[recurso] detallado__ que explica la estrategia exacta que utilizo." },
      { overlay: "bottom", body: "**Responde \"PALABRA CLAVE\"** para acceder a él." }
    ]
  }
];
