/* =========================================================================
 *  Modelo de stories estilo Instagram (párrafos + resaltados editables)
 *
 *  Cada story tiene:
 *    - body:    texto en párrafos. Soporta marcas inline editables:
 *                 ==texto==  → resaltado (fondo de color)
 *                 __texto__  → subrayado
 *                 **texto**  → color de acento
 *    - vpos:    posición vertical del bloque ("top" | "center" | "bottom")
 *    - overlay: oscurecido del fondo ("full" | "bottom" | "soft" | "none")
 *
 *  Lienzo siempre 1080 x 1920 (9:16).
 * ========================================================================= */

const CANVAS_W = 1080;
const CANVAS_H = 1920;

// Estilo por defecto de una secuencia (editable desde el editor)
const DEFAULT_STYLE = {
  font: '-apple-system, "SF Pro Display", "SF Pro Text", Inter, system-ui, sans-serif',
  textColor: "#ffffff",
  highlightColor: "#ff6a1a", // naranja ABMedia
  highlightText: "#ffffff",
  weight: 700,
  size: 1,        // multiplicador de tamaño (0.85 / 1 / 1.15)
  align: "left"
};

// Tipografías de ejemplo seleccionables
const FONTS = [
  { name: "SF Pro (Apple)", value: '-apple-system, "SF Pro Display", "SF Pro Text", Inter, system-ui, sans-serif' },
  { name: "Inter",          value: 'Inter, system-ui, sans-serif' },
  { name: "Montserrat",     value: '"Montserrat", system-ui, sans-serif' },
  { name: "Poppins",        value: '"Poppins", system-ui, sans-serif' },
  { name: "Playfair",       value: '"Playfair Display", Georgia, serif' }
];

// Estructuras en blanco para "Nueva secuencia"
const STRUCTURES = {
  s1: { name: "1 historia",   frames: 1 },
  s3: { name: "3 historias",  frames: 3 },
  s5: { name: "5 historias",  frames: 5 }
};

function blankBody(i) {
  return "Escribe aquí tu mensaje.\n\nDestaca palabras con ==resaltado== o __subrayado__.";
}
