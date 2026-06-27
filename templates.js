/*
 * Plantillas de secuencias de Stories.
 *
 * Cada plantilla define una secuencia de "slides" (stories).
 * Cada slide define:
 *   - name:    nombre que se ve en el editor
 *   - overlay: tipo de capa oscura para que el texto se lea bien
 *              ("bottom", "top", "full", "none")
 *   - texts:   bloques de texto editables, con su posición y estilo
 *
 * Coordenadas siempre sobre un lienzo de 1080 x 1920 px (formato 9:16).
 * Para textos centrados, "x" es el centro horizontal.
 */

const CANVAS_W = 1080;
const CANVAS_H = 1920;

// Helpers de posición rápidos
const CX = CANVAS_W / 2;

const TEMPLATES = {
  promo: {
    name: "🔥 Oferta / Promoción",
    description: "3 stories: portada, producto y llamada a la acción.",
    slides: [
      {
        name: "1 · Portada",
        overlay: "bottom",
        texts: [
          { id: "badge", label: "Etiqueta superior", default: "NUEVO", x: CX, y: 320, maxWidth: 900, size: 46, weight: 700, align: "center", color: "#ffffff", accent: true, transform: "uppercase", track: 6 },
          { id: "title", label: "Título grande", default: "OFERTA\nESPECIAL", x: CX, y: 1380, maxWidth: 960, size: 132, weight: 800, align: "center", color: "#ffffff", lineHeight: 1.05, transform: "uppercase" },
          { id: "subtitle", label: "Subtítulo", default: "Solo por tiempo limitado", x: CX, y: 1600, maxWidth: 920, size: 48, weight: 500, align: "center", color: "#ffffff" }
        ]
      },
      {
        name: "2 · Producto",
        overlay: "full",
        texts: [
          { id: "eyebrow", label: "Antetítulo", default: "DESCUBRE", x: CX, y: 760, maxWidth: 900, size: 42, weight: 700, align: "center", color: "#ffffff", accent: true, transform: "uppercase", track: 6 },
          { id: "headline", label: "Mensaje principal", default: "El producto que estabas esperando", x: CX, y: 960, maxWidth: 880, size: 72, weight: 700, align: "center", color: "#ffffff", lineHeight: 1.1 },
          { id: "detail", label: "Detalle", default: "Calidad premium · Envío rápido", x: CX, y: 1220, maxWidth: 880, size: 44, weight: 500, align: "center", color: "#ffffff" }
        ]
      },
      {
        name: "3 · Cierre (CTA)",
        overlay: "bottom",
        texts: [
          { id: "price", label: "Precio / Gancho", default: "-30%", x: CX, y: 1280, maxWidth: 900, size: 150, weight: 800, align: "center", color: "#ffffff", accent: true },
          { id: "cta", label: "Llamada a la acción", default: "Desliza hacia arriba ↑", x: CX, y: 1640, maxWidth: 920, size: 54, weight: 700, align: "center", color: "#ffffff", transform: "uppercase", track: 2 }
        ]
      }
    ]
  },

  testimonio: {
    name: "💬 Testimonio / Reseña",
    description: "3 stories: intro, la reseña y el cierre de confianza.",
    slides: [
      {
        name: "1 · Intro",
        overlay: "bottom",
        texts: [
          { id: "label", label: "Etiqueta", default: "LO QUE DICEN DE NOSOTROS", x: CX, y: 1400, maxWidth: 920, size: 50, weight: 700, align: "center", color: "#ffffff", accent: true, transform: "uppercase", track: 3 },
          { id: "sub", label: "Subtítulo", default: "Clientes reales, opiniones reales", x: CX, y: 1540, maxWidth: 900, size: 46, weight: 500, align: "center", color: "#ffffff" }
        ]
      },
      {
        name: "2 · Reseña",
        overlay: "full",
        texts: [
          { id: "quote", label: "Texto de la reseña", default: "“Un servicio excelente, repetiré sin duda. Totalmente recomendable.”", x: CX, y: 860, maxWidth: 900, size: 66, weight: 600, align: "center", color: "#ffffff", lineHeight: 1.2 },
          { id: "author", label: "Autor", default: "— María G.", x: CX, y: 1320, maxWidth: 880, size: 48, weight: 700, align: "center", color: "#ffffff", accent: true }
        ]
      },
      {
        name: "3 · Cierre",
        overlay: "bottom",
        texts: [
          { id: "stars", label: "Valoración", default: "★★★★★", x: CX, y: 1300, maxWidth: 920, size: 96, weight: 700, align: "center", color: "#ffffff", accent: true },
          { id: "cta", label: "Llamada a la acción", default: "Únete a nuestros clientes", x: CX, y: 1520, maxWidth: 920, size: 54, weight: 700, align: "center", color: "#ffffff", transform: "uppercase", track: 2 }
        ]
      }
    ]
  },

  tips: {
    name: "💡 Tips / Consejos",
    description: "4 stories: portada + 3 consejos numerados.",
    slides: [
      {
        name: "1 · Portada",
        overlay: "bottom",
        texts: [
          { id: "kicker", label: "Antetítulo", default: "GUÍA RÁPIDA", x: CX, y: 1280, maxWidth: 900, size: 46, weight: 700, align: "center", color: "#ffffff", accent: true, transform: "uppercase", track: 6 },
          { id: "title", label: "Título", default: "3 consejos que debes conocer", x: CX, y: 1460, maxWidth: 920, size: 84, weight: 800, align: "center", color: "#ffffff", lineHeight: 1.1 }
        ]
      },
      {
        name: "2 · Consejo 1",
        overlay: "full",
        texts: [
          { id: "num", label: "Número", default: "01", x: CX, y: 720, maxWidth: 900, size: 160, weight: 800, align: "center", color: "#ffffff", accent: true },
          { id: "tip", label: "Consejo", default: "Escribe aquí tu primer consejo", x: CX, y: 1040, maxWidth: 880, size: 66, weight: 700, align: "center", color: "#ffffff", lineHeight: 1.15 }
        ]
      },
      {
        name: "3 · Consejo 2",
        overlay: "full",
        texts: [
          { id: "num", label: "Número", default: "02", x: CX, y: 720, maxWidth: 900, size: 160, weight: 800, align: "center", color: "#ffffff", accent: true },
          { id: "tip", label: "Consejo", default: "Escribe aquí tu segundo consejo", x: CX, y: 1040, maxWidth: 880, size: 66, weight: 700, align: "center", color: "#ffffff", lineHeight: 1.15 }
        ]
      },
      {
        name: "4 · Consejo 3",
        overlay: "full",
        texts: [
          { id: "num", label: "Número", default: "03", x: CX, y: 720, maxWidth: 900, size: 160, weight: 800, align: "center", color: "#ffffff", accent: true },
          { id: "tip", label: "Consejo", default: "Escribe aquí tu tercer consejo", x: CX, y: 1040, maxWidth: 880, size: 66, weight: 700, align: "center", color: "#ffffff", lineHeight: 1.15 }
        ]
      }
    ]
  },

  minimal: {
    name: "✨ Minimalista",
    description: "2 stories limpias: anuncio y cierre.",
    slides: [
      {
        name: "1 · Anuncio",
        overlay: "full",
        texts: [
          { id: "title", label: "Título", default: "Tu mensaje aquí", x: CX, y: 960, maxWidth: 880, size: 96, weight: 800, align: "center", color: "#ffffff", lineHeight: 1.1 }
        ]
      },
      {
        name: "2 · Cierre",
        overlay: "bottom",
        texts: [
          { id: "cta", label: "Llamada a la acción", default: "@abmedia", x: CX, y: 1560, maxWidth: 900, size: 60, weight: 700, align: "center", color: "#ffffff", accent: true }
        ]
      }
    ]
  },

  dato: {
    name: "📊 Dato / Cifra",
    description: "3 stories: gancho, cifra grande y conclusión.",
    slides: [
      {
        name: "1 · Gancho",
        overlay: "full",
        texts: [
          { id: "kicker", label: "Antetítulo", default: "¿SABÍAS QUE...?", x: CX, y: 820, maxWidth: 900, size: 46, weight: 700, align: "center", color: "#ffffff", accent: true, transform: "uppercase", track: 6 },
          { id: "hook", label: "Gancho", default: "La mayoría comete este error sin darse cuenta", x: CX, y: 1040, maxWidth: 880, size: 70, weight: 700, align: "center", color: "#ffffff", lineHeight: 1.15 }
        ]
      },
      {
        name: "2 · Cifra",
        overlay: "full",
        texts: [
          { id: "number", label: "Cifra", default: "87%", x: CX, y: 820, maxWidth: 980, size: 230, weight: 800, align: "center", color: "#ffffff", accent: true },
          { id: "context", label: "Contexto de la cifra", default: "no consigue resultados por no tener un sistema", x: CX, y: 1120, maxWidth: 880, size: 56, weight: 600, align: "center", color: "#ffffff", lineHeight: 1.2 }
        ]
      },
      {
        name: "3 · Conclusión",
        overlay: "bottom",
        texts: [
          { id: "takeaway", label: "Conclusión", default: "No te quedes en el lado equivocado", x: CX, y: 1420, maxWidth: 900, size: 64, weight: 700, align: "center", color: "#ffffff", lineHeight: 1.15 },
          { id: "cta", label: "Llamada a la acción", default: "Te lo cuento ↑", x: CX, y: 1620, maxWidth: 900, size: 50, weight: 700, align: "center", color: "#ffffff", accent: true, transform: "uppercase", track: 2 }
        ]
      }
    ]
  }
};
