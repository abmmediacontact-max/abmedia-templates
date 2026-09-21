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

// Tipografías seleccionables. Las cuatro primeras conservan su valor de
// siempre (lo guardan las secuencias ya hechas). Las de Google se cargan sólo
// cuando se usan; `w` es el grosor con el que se dibuja (algunas sólo existen
// en uno y forzar otro las deforma).
const FONTS = [
  { name: "SF Pro (Apple)", value: '-apple-system, "SF Pro Display", "SF Pro Text", Inter, system-ui, sans-serif', w: 700, grupo: "Sans" },
  { name: "Inter",          value: 'Inter, system-ui, sans-serif', google: true, fam: "Inter", w: 700, grupo: "Sans" },
  { name: "Montserrat",     value: '"Montserrat", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Poppins",        value: '"Poppins", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "DM Sans", value: '"DM Sans", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Manrope", value: '"Manrope", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Plus Jakarta Sans", value: '"Plus Jakarta Sans", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Outfit", value: '"Outfit", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Figtree", value: '"Figtree", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Urbanist", value: '"Urbanist", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Sora", value: '"Sora", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Space Grotesk", value: '"Space Grotesk", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Work Sans", value: '"Work Sans", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Raleway", value: '"Raleway", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Lato", value: '"Lato", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Open Sans", value: '"Open Sans", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Roboto", value: '"Roboto", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Nunito", value: '"Nunito", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Rubik", value: '"Rubik", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Archivo", value: '"Archivo", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Bricolage Grotesque", value: '"Bricolage Grotesque", system-ui, sans-serif', google: true, w: 700, grupo: "Sans" },
  { name: "Bebas Neue", value: '"Bebas Neue", system-ui, sans-serif', google: true, w: 400, grupo: "Display" },
  { name: "Anton", value: '"Anton", system-ui, sans-serif', google: true, w: 400, grupo: "Display" },
  { name: "Oswald", value: '"Oswald", system-ui, sans-serif', google: true, w: 700, grupo: "Display" },
  { name: "Archivo Black", value: '"Archivo Black", system-ui, sans-serif', google: true, w: 400, grupo: "Display" },
  { name: "League Spartan", value: '"League Spartan", system-ui, sans-serif', google: true, w: 700, grupo: "Display" },
  { name: "Syne", value: '"Syne", system-ui, sans-serif', google: true, w: 700, grupo: "Display" },
  { name: "Playfair",       value: '"Playfair Display", Georgia, serif', google: true, w: 700, grupo: "Serif" },
  { name: "DM Serif Display", value: '"DM Serif Display", Georgia, serif', google: true, w: 400, grupo: "Serif" },
  { name: "Instrument Serif", value: '"Instrument Serif", Georgia, serif', google: true, w: 400, grupo: "Serif" },
  { name: "Fraunces", value: '"Fraunces", Georgia, serif', google: true, w: 700, grupo: "Serif" },
  { name: "Lora", value: '"Lora", Georgia, serif', google: true, w: 700, grupo: "Serif" },
  { name: "Merriweather", value: '"Merriweather", Georgia, serif', google: true, w: 700, grupo: "Serif" },
  { name: "Libre Baskerville", value: '"Libre Baskerville", Georgia, serif', google: true, w: 700, grupo: "Serif" },
  { name: "Cormorant Garamond", value: '"Cormorant Garamond", Georgia, serif', google: true, w: 700, grupo: "Serif" },
  { name: "Caveat", value: '"Caveat", cursive', google: true, w: 700, grupo: "Manuscrita" },
  { name: "Pacifico", value: '"Pacifico", cursive', google: true, w: 400, grupo: "Manuscrita" },
  { name: "Permanent Marker", value: '"Permanent Marker", cursive', google: true, w: 400, grupo: "Manuscrita" },
];

// Estructuras en blanco para "Nueva secuencia"
const STRUCTURES = {
  s1: { name: "1 historia",   frames: 1 },
  s3: { name: "3 historias",  frames: 3 },
  s5: { name: "5 historias",  frames: 5 }
};

function blankBody(i) {
  // Frame vacío: el usuario empieza a escribir desde cero.
  return "";
}
