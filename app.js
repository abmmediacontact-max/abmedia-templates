/* =========================================================================
 *  Sequence Builder · ABMedia
 * ========================================================================= */

const state = {
  user: null,
  isAdminUser: false,
  images: [],
  sequences: [],
  userTemplates: [],
  reviewQueue: [],
  inbox: [],
  active: null,
  current: 0,
  view: "library",
  libraryFilter: "all",
  libraryCat: null,
  calMonth: null,  // Date (1st of visible month)
  schedule: {},    // { 'YYYY-MM-DD': catalogId }
  seq: 1
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
let editorCanvas;
const ctx = () => editorCanvas.getContext("2d");

const STATUS = {
  draft:     { label: "Borrador",   cls: "st-draft" },
  scheduled: { label: "Programada", cls: "st-scheduled" },
  published: { label: "Publicada",  cls: "st-published" }
};
// Compatibilidad: las que quedaran "en progreso" se leen como borrador
function estadoDe(seq) {
  const e = seq && seq.status === "progress" ? "draft" : (seq && seq.status) || "draft";
  return STATUS[e] ? e : "draft";
}

// Lazy rendering de canvases en tarjetas (solo dibuja cuando entra al viewport)
const _cardObserver = (typeof IntersectionObserver !== "undefined")
  ? new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && e.target._drawFn) {
          e.target._drawFn();
          e.target._drawFn = null;
          _cardObserver.unobserve(e.target);
        }
      });
    }, { rootMargin: "300px" })
  : null;

function makeCardCanvas(slide, style, w = 270, h = 480) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h; cv.className = "card-canvas";
  const fn = () => { try { drawSlide(cv.getContext("2d"), slide, w, h, style); } catch {} };
  if (_cardObserver) {
    cv._drawFn = fn;
    _cardObserver.observe(cv);
  } else { fn(); }
  return cv;
}

/* =========================================================================
 *  IndexedDB para imágenes (persistente entre sesiones)
 * ========================================================================= */
const imgDB = {
  // Una base por cuenta: si dos personas usan el mismo navegador, cada una
  // ve sólo sus fotos. Antes compartían galería sin querer.
  DB_BASE: "abmedia_images_v2",
  _uid: null,
  get DB_NAME() { return this._uid ? `${this.DB_BASE}_${this._uid}` : this.DB_BASE; },
  STORE: "files",
  _db: null,
  /* Se llama al iniciar sesión. Si la cuenta cambia, se cierra la base
     anterior para no mezclar galerías. */
  usarCuenta(uid) {
    if (this._uid === uid) return;
    if (this._db) { try { this._db.close(); } catch {} }
    this._db = null;
    this._uid = uid || null;
  },
  async open() {
    if (this._db) return this._db;
    // Migración: borra la v1 antigua (autoIncrement) para evitar duplicados acumulados
    try { indexedDB.deleteDatabase("abmedia_images_v1"); } catch {}
    return new Promise((res, rej) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE)) {
          db.createObjectStore(this.STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = () => { this._db = req.result; res(req.result); };
      req.onerror = () => rej(req.error);
    });
  },
  keyOf(name, size) { return `${name}|${size || 0}`; },
  async put(name, blob, key, tipo = null) {
    const db = await this.open();
    const k = key || this.keyOf(name, blob.size);
    return new Promise((res, rej) => {
      const tx = db.transaction(this.STORE, "readwrite");
      tx.objectStore(this.STORE).put({ key: k, name, size: blob.size, blob, t: Date.now(), tipo });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  async getAll() {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction(this.STORE, "readonly");
      const req = tx.objectStore(this.STORE).getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });
  },
  async clear() {
    const db = await this.open();
    return new Promise((res) => {
      const tx = db.transaction(this.STORE, "readwrite");
      tx.objectStore(this.STORE).clear();
      tx.oncomplete = () => res();
    });
  },
  async deleteByKey(key) {
    const db = await this.open();
    return new Promise((res) => {
      const tx = db.transaction(this.STORE, "readwrite");
      tx.objectStore(this.STORE).delete(key);
      tx.oncomplete = () => res();
    });
  }
};

/*
 * Recorre `items` haciendo hasta `n` a la vez. Una detrás de otra desaprovecha
 * la máquina y la conexión; todas de golpe con 200 fotos satura la memoria
 * del móvil. Un puñado a la vez es lo que más rinde.
 */
async function enParalelo(items, n, fn) {
  let i = 0;
  const trabajador = async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, trabajador));
}

function blobToImage(blob, name) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res({ name, img });
    img.onerror = () => res(null);
    img.src = URL.createObjectURL(blob);
  });
}

// Reduce el peso de las fotos antes de guardarlas (target max 1920px lado mayor)
/* Las fotos del iPhone vienen en HEIC y sólo Safari sabe abrirlas. En el
   resto de navegadores hay que convertirlas antes de tocarlas. La librería
   se carga sólo cuando hace falta, para no penalizar al que no las usa. */
function esHeic(file) {
  const t = (file.type || "").toLowerCase();
  const n = (file.name || "").toLowerCase();
  return t.includes("heic") || t.includes("heif") ||
         n.endsWith(".heic") || n.endsWith(".heif");
}

let _heicCargando = null;
function cargarConversorHeic() {
  if (window.heic2any) return Promise.resolve(true);
  if (_heicCargando) return _heicCargando;
  _heicCargando = new Promise(res => {
    const sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
    sc.onload = () => res(!!window.heic2any);
    sc.onerror = () => res(false);
    document.head.appendChild(sc);
  });
  return _heicCargando;
}

/* Devuelve un blob que el navegador sepa dibujar, o null si no ha podido. */
async function normalizarImagen(file) {
  if (!esHeic(file)) return file;
  // Safari abre HEIC de forma nativa: si puede, no hace falta convertir
  if (await sePuedeDibujar(file)) return file;
  const ok = await cargarConversorHeic();
  if (!ok) return null;
  try {
    const out = await window.heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const b = Array.isArray(out) ? out[0] : out;
    return new File([b], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
  } catch (e) {
    console.warn("heic2any", e);
    return null;
  }
}

function sePuedeDibujar(blob) {
  return new Promise(res => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload  = () => { URL.revokeObjectURL(url); res(true); };
    img.onerror = () => { URL.revokeObjectURL(url); res(false); };
    img.src = url;
  });
}

/*
 * Deja cada foto en JPEG de 1920 px de lado mayor como mucho, que es lo que
 * mide una story (1080×1920).
 *
 * Antes, si la foto ya medía menos de 1920 px se guardaba el archivo tal
 * cual. Parece razonable, pero una captura en PNG de 1600 px pesa diez veces
 * más que la misma en JPEG: medido con doce fotos, las dos PNG ocupaban el
 * 62 % del total. Y encima se subían a la nube etiquetadas como JPEG sin
 * serlo. Ahora sólo se deja intacto lo que ya es un JPEG pequeño; todo lo
 * demás se recomprime.
 */
const LADO_MAX = 1920, CALIDAD = 0.82, JPEG_LIGERO = 450 * 1024;

/*
 * WebP si el navegador sabe crearlo; si no, JPEG.
 *
 * Medido: codificar una foto de 1920 px en JPEG tardaba ~1 s y en WebP ~160
 * ms, y el WebP pesa un 25-35 % menos, que también es menos que subir y
 * bajar de la nube. Safari sabe LEER WebP pero no crearlo: si se le pide,
 * devuelve un PNG enorme sin avisar. Por eso se prueba con un lienzo de 2 px
 * y se mira qué ha devuelto de verdad, en vez de fiarse del navegador.
 */
let _formatoFoto = null;
function formatoFoto() {
  if (_formatoFoto) return _formatoFoto;
  _formatoFoto = new Promise(res => {
    try {
      const c = document.createElement("canvas"); c.width = c.height = 2;
      c.toBlob(b => res(b && b.type === "image/webp" ? "image/webp" : "image/jpeg"), "image/webp", 0.8);
    } catch { res("image/jpeg"); }
  });
  return _formatoFoto;
}

async function resizeImageBlob(file, maxDim = LADO_MAX, quality = CALIDAD) {
  const formato = await formatoFoto();
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const w0 = img.width, h0 = img.height;
      const ratio = Math.min(1, maxDim / Math.max(w0, h0));
      const tw = Math.max(1, Math.round(w0 * ratio));
      const th = Math.max(1, Math.round(h0 * ratio));
      if (ratio >= 1 && (file.type === "image/jpeg" || file.type === "image/webp") && file.size <= JPEG_LIGERO) {
        URL.revokeObjectURL(url); res(file); return;
      }
      const c = document.createElement("canvas");
      c.width = tw; c.height = th;
      const x = c.getContext("2d", { alpha: false });
      x.imageSmoothingQuality = "high";
      // Fondo blanco: un PNG con transparencia saldría con el hueco en negro.
      x.fillStyle = "#fff"; x.fillRect(0, 0, tw, th);
      x.drawImage(img, 0, 0, tw, th);
      const q = formato === "image/webp" ? 0.8 : quality;
      c.toBlob(b => {
        URL.revokeObjectURL(url);
        res(b || file);
      }, formato, q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(file); };
    img.src = url;
  });
}

/* =========================================================================
 *  Persistencia local
 *
 *  Cada clave lleva el id de la cuenta. Antes eran las mismas para todo el
 *  navegador: si dos clientes usaban el mismo ordenador, el segundo veía el
 *  calendario del primero. Las fotos ya iban separadas (una base de
 *  IndexedDB por cuenta); esto no.
 * ========================================================================= */
// Sin sesión no se escribe en ninguna clave que luego lea una cuenta.
const claveCuenta = (base) => state.user ? `${base}_${state.user.id}` : `${base}_sin_cuenta`;
const store = {
  get KEY() { return claveCuenta("abmedia_sequences_v3"); },
  load() { try { return JSON.parse(localStorage.getItem(this.KEY)) || null; } catch { return null; } },
  save(seqs) {
    const data = seqs.map(s => ({
      id: s.id, title: s.title, category: s.category, status: s.status,
      submitted: !!s.submitted, style: s.style,
      slides: s.slides.map(sl => ({ body: sl.body, pos: sl.pos, align: sl.align, caso: sl.caso || null, overlay: sl.overlay, bg: sl.bg, bgKey: sl.bgKey || null, sticker: sl.sticker || null }))
    }));
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); } catch {}
  }
};
const storeSched = {
  get KEY() { return claveCuenta("abmedia_schedule_v1"); },
  load() { try { return JSON.parse(localStorage.getItem(this.KEY)) || null; } catch { return null; } },
  save(s) { try { localStorage.setItem(this.KEY, JSON.stringify(s)); } catch {} }
};
const storeT = {
  get KEY() { return claveCuenta("abmedia_user_templates_v2"); },
  load() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
  save(t) { try { localStorage.setItem(this.KEY, JSON.stringify(t)); } catch {} }
};

/* Guarda en el navegador y, si hay sesión, en la nube. */
async function persistAhora() {
  store.save(state.sequences);
  if (!state.user || !state.active) return;
  const ref = state.active;
  const row = await sbDB.sbUpsertSequence(ref);
  if (row && ref && !ref.cloudId) ref.cloudId = row.id;
  return row;
}

/* Igual, pero sin esperar: para los guardados automáticos de cada retoque. */
const persist = () => { persistAhora().catch(() => {}); };

/* =========================================================================
 *  Construcción de secuencias
 * ========================================================================= */
/* Color de acento: de base ninguno. El que se elige se guarda en la cuenta y
   es el de las secuencias nuevas hasta que se cambie. Si alguien marca texto
   sin haber elegido, se pinta con ACENTO_RESERVA para que se vea algo. */
const ACENTO_RESERVA = "#ff6a1a";
let acentoPreferido = null;
const acentoDe = st => (st && st.highlightColor) || ACENTO_RESERVA;
let _guardaAcentoT = null;
function recuerdaAcento(color) {
  acentoPreferido = color;
  try { localStorage.setItem("sb_acento_" + state.user?.id, color); } catch {}
  clearTimeout(_guardaAcentoT);
  _guardaAcentoT = setTimeout(() => sbDB.sbGuardarAcento(color).catch(() => {}), 600);
}
async function cargaAcento(uid) {
  try { acentoPreferido = localStorage.getItem("sb_acento_" + uid) || null; } catch {}
  const nube = await sbDB.sbLeerAcento().catch(() => undefined);
  if (nube !== undefined) {
    acentoPreferido = nube;
    try { nube ? localStorage.setItem("sb_acento_" + uid, nube) : localStorage.removeItem("sb_acento_" + uid); } catch {}
  }
}
/* Tipografía: igual que el acento. La última que se elige es la de las
   secuencias nuevas hasta que se cambie (se guarda el nombre de la lista). */
let fuentePreferida = null;
let _guardaFuenteT = null;
function recuerdaFuente(nombre) {
  fuentePreferida = nombre;
  try { localStorage.setItem("sb_fuente_" + state.user?.id, nombre); } catch {}
  clearTimeout(_guardaFuenteT);
  _guardaFuenteT = setTimeout(() => sbDB.sbGuardarFuente(nombre).catch(() => {}), 600);
}
async function cargaFuentePreferida(uid) {
  try { fuentePreferida = localStorage.getItem("sb_fuente_" + uid) || null; } catch {}
  const nube = await sbDB.sbLeerFuente().catch(() => undefined);
  if (nube !== undefined) {
    fuentePreferida = nube;
    try { nube ? localStorage.setItem("sb_fuente_" + uid, nube) : localStorage.removeItem("sb_fuente_" + uid); } catch {}
  }
}
function estiloFuentePreferida() {
  const f = fuentePreferida && FONTS.find(x => x.name === fuentePreferida);
  return f ? { font: f.value, weight: f.w } : {};
}
function newStyle() { return { ...JSON.parse(JSON.stringify(DEFAULT_STYLE)), highlightColor: acentoPreferido, ...estiloFuentePreferida() }; }
// Las plantillas no imponen su acento: manda el que haya elegido cada uno.
const sinAcento = st => { if (!st) return st; const { highlightColor, highlightText, ...resto } = st; return resto; };

function makeSlide(s) {
  return {
    body: s.body,
    overlay: s.overlay || "bottom",
    pos: s.pos || { x: 0.05, y: 0.085 },
    align: s.align || "left",
    caso: s.caso || null,     // "upper" / "lower" / null = tal cual
    bg: s.bg ? { ...s.bg } : { zoom: 1, ox: 0, oy: 0 },
    bgKey: s.bgKey || null,   // qué foto lleva: la clave, que no cambia
    sticker: s.sticker ? JSON.parse(JSON.stringify(s.sticker)) : null,
    bgIndex: -1,              // dónde está ahora en la galería, para pintar
    inset: null, _textBox: null
  };
}
/* Categorías de antes del catálogo actual. Quedaron en secuencias viejas; sin
   traducirlas salían como «Venta» en gris y no aparecían en ningún filtro. */
const CATEGORIAS_ANTIGUAS = { ventas: "venta", autoridad: "flex" };
const normalizaCategoria = (c) => CATEGORIES[c] ? c : (CATEGORIAS_ANTIGUAS[c] || "venta");

function instantiate(data) {
  const seq = {
    id: data.id || state.seq++,
    title: data.title || "Secuencia",
    category: normalizaCategoria(data.category),
    status: data.status || "draft",
    submitted: !!data.submitted,
    style: data.style ? { ...newStyle(), ...data.style } : newStyle(),
    slides: (data.slides || []).map(makeSlide)
  };
  // scheduledDate vive en style (para persistir en DB via JSONB)
  if (seq.style.scheduledDate) seq.scheduledDate = seq.style.scheduledDate;
  if (data.id && data.id >= state.seq) state.seq = data.id + 1;
  // Lo que ya tenga foto elegida la conserva; sólo se rellenan los huecos.
  assignRandomImages(seq, { soloVacios: true });
  return seq;
}
function fromCatalog(catId, extra = {}) {
  const c = CATALOG.find(x => x.id === catId);
  const seq = instantiate({ title: c.title, category: c.category, slides: c.slides, ...extra });
  seq.style.plantilla = catId;   // de qué plantilla sale (para «otra de la misma categoría»)
  return seq;
}

/*
 * «Otra de la misma categoría»: cambia las stories de una secuencia del
 * calendario por otra plantilla de su categoría, sin tocar el día, el estado
 * ni el estilo. Evita la que ya era y, si puede, las que ya salen esa semana.
 */
function plantillaDe(seq) {
  if (seq.style && seq.style.plantilla) return seq.style.plantilla;
  const c = CATALOG.find(x => x.title === seq.title && normalizaCategoria(x.category) === seq.category);
  return c ? c.id : null;
}
function cambiaPorOtra(seq) {
  if (!seq) return null;
  const actual = plantillaDe(seq);
  let pool = CATALOG.filter(x => normalizaCategoria(x.category) === seq.category && x.id !== actual);
  if (seq.scheduledDate) {
    const d = new Date(seq.scheduledDate + "T12:00");
    const lunes = new Date(d); lunes.setDate(d.getDate() - (d.getDay() + 6) % 7);
    const fin = new Date(lunes); fin.setDate(lunes.getDate() + 7);
    const usadas = new Set(state.sequences
      .filter(x => x !== seq && x.scheduledDate && new Date(x.scheduledDate + "T12:00") >= lunes && new Date(x.scheduledDate + "T12:00") < fin)
      .map(plantillaDe));
    const libres = pool.filter(x => !usadas.has(x.id));
    if (libres.length) pool = libres;
  }
  if (!pool.length) { aviso("No hay otra plantilla de esta categoría", "mal"); return null; }
  const t = pool[Math.floor(Math.random() * pool.length)];
  const nueva = fromCatalog(t.id, { id: -1 });
  seq.title = t.title;
  seq.slides = nueva.slides;
  seq.style.plantilla = t.id;
  guardarSecuencia(seq);
  return seq;
}
function refrescaTrasCambio() {
  renderCalendar();
  if (state.view === "gestion" && typeof renderGestion === "function") renderGestion();
}
function fromStructure(frames, category) {
  const slides = Array.from({ length: frames }, (_, i) => ({ body: blankBody(i), overlay: "bottom" }));
  return instantiate({ title: "Nueva secuencia", category, slides, status: "draft" });
}
function fromTemplate(tpl, extra = {}) {
  return instantiate({ title: tpl.title, category: tpl.category, slides: tpl.slides, style: sinAcento(tpl.style), ...extra });
}
/*
 * Qué frame lleva la llamada a la acción.
 *
 * Las plantillas no traen marca de CTA, así que se reconoce por lo que dice.
 * Revisado contra las 80 del catálogo: 38 lo llevan en el último frame, 2 en
 * el segundo de tres, y 40 no piden nada. Por eso no vale «el último siempre»:
 * se busca el último frame que pida algo, y si ninguno pide nada, no hay CTA.
 */
const RE_CTA = /\b(dm|md|escr[ií]beme|escribe|responde|resp[oó]ndeme|comenta|link|enlace|pincha|toca|swipe|desliza|encuesta|reserva|ap[uú]ntate|inscr[ií]b\w*|compra|plazas|cupos|mensaje|env[ií]a|caja de preguntas|clic|en mi perfil|bio)\b/i;
function frameCta(seq) {
  for (let i = seq.slides.length - 1; i >= 0; i--) {
    if (RE_CTA.test(seq.slides[i].body || "")) return i;
  }
  return -1;
}

/* El frame que tiene que llevar una foto del owner: el primero y el del CTA. */
function pideOwner(seq, i) { return i === 0 || i === frameCta(seq); }

/**
 * Reparte las fotos: owner en el primero y en el del CTA, background en el
 * resto. Si falta un tipo se tira del otro, para que ningún frame se quede
 * sin foto; y las fotos sin clasificar entran como último recurso.
 * Dentro de cada montón se barajan y se gastan en orden, para no repetir.
 */
/*
 * QUÉ FOTO LLEVA CADA FRAME
 *
 * Se recuerda por la clave de la foto (nombre|tamaño), no por su posición en
 * la galería. La posición cambia al borrar una foto, al recargar y de un
 * ordenador a otro; la clave no. Y la clave se guarda con la secuencia, en
 * la nube: antes no se guardaba nada, así que en cada recarga se volvían a
 * repartir fotos al azar y se perdía lo que hubieras elegido a mano.
 */
function ponFondo(slide, i) {
  slide.bgIndex = i;
  slide.bgKey = i >= 0 && state.images[i] ? state.images[i].key : null;
}

/* Vuelve a situar cada frame en la galería a partir de su clave. Se llama
   cada vez que la galería cambia (carga, subida, borrado, sincronización). */
function resuelveFondos() {
  const pos = new Map(state.images.map((im, i) => [im.key, i]));
  const seqs = new Set(state.sequences || []);
  if (state.active) seqs.add(state.active);
  seqs.forEach(seq => seq.slides.forEach(sl => {
    sl.bgIndex = sl.bgKey && pos.has(sl.bgKey) ? pos.get(sl.bgKey) : -1;
  }));
}

/*
 * Reparte fotos respetando la regla: owner en el primero y en el del CTA,
 * background en el resto.
 *   soloVacios → no toca los frames que ya tienen foto elegida.
 *   huerfanos  → cuenta como vacío el frame cuya foto ya no existe.
 * Un frame con clave cuya foto todavía no ha llegado de la nube NO es un
 * hueco: se espera a que llegue en vez de ponerle otra encima.
 */
function assignRandomImages(seq, { soloVacios = false, huerfanos = false } = {}) {
  const n = state.images.length;
  const pos = new Map(state.images.map((im, i) => [im.key, i]));
  const vacio = sl => !sl.bgKey || (huerfanos && !pos.has(sl.bgKey));
  // Primero se sitúa lo que se conserva.
  seq.slides.forEach(sl => { sl.bgIndex = sl.bgKey && pos.has(sl.bgKey) ? pos.get(sl.bgKey) : -1; });
  if (!n) { if (!soloVacios) seq.slides.forEach(sl => ponFondo(sl, -1)); return; }
  if (soloVacios && !seq.slides.some(vacio)) return;
  // Las fotos que ya usa esta secuencia van al final de cada montón, para
  // no repetir una foto que ya sale dos frames más allá.
  const usadas = new Set(soloVacios ? seq.slides.filter(sl => !vacio(sl)).map(sl => sl.bgIndex) : []);
  const idx = [...Array(n).keys()];
  const monton = (f) => {
    const l = shuffle(idx.filter(f));
    return [...l.filter(i => !usadas.has(i)), ...l.filter(i => usadas.has(i))];
  };
  const montones = {
    owner: monton(i => state.images[i].tipo === "owner"),
    fondo: monton(i => state.images[i].tipo === "fondo"),
    resto: monton(i => !state.images[i].tipo),
  };
  const gastadas = { owner: 0, fondo: 0, resto: 0 };
  const saca = (orden) => {
    for (const m of orden) {
      const l = montones[m];
      if (l.length) return l[gastadas[m]++ % l.length];
    }
    return -1;
  };
  seq.slides.forEach((sl, i) => {
    if (soloVacios && !vacio(sl)) return;
    ponFondo(sl, pideOwner(seq, i)
      ? saca(["owner", "resto", "fondo"])
      : saca(["fondo", "resto", "owner"]));
  });
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* =========================================================================
 *  Imágenes (subida + persistencia)
 * ========================================================================= */
/*
 * Antes de guardar nada, cada foto dice qué es: Owner o Background.
 *
 * Se abre con las fotos recién elegidas en miniatura. Se marcan una o varias
 * tocándolas (o todas de golpe) y se les pone el tipo; cada una enseña el
 * suyo. No se sube nada hasta que estén todas marcadas: si no, entrarían
 * sin clasificar y la regla de «abre con una cara» no tendría con qué
 * trabajar. Cerrar o cancelar no sube nada.
 *
 * Devuelve un Map archivo → tipo, o null si se cancela.
 */
function clasificaSubida(files) {
  return new Promise(resolve => {
    const tipos = new Map();           // archivo → "owner" | "fondo"
    const sel = new Set();             // índices marcados
    let hecho = false;

    const d = montaDialogo(`
      <div class="modal-head"><h2>¿Qué es cada foto?</h2></div>
      <p class="modal-sub">Toca las fotos en las que sales tú y márcalas como Owner; las de paisaje, portátil, mesa… como Background. Cada secuencia abre con una tuya, y el frame que pide algo también.</p>
      <div class="cs-barra">
        <button class="btn sm ghost" data-cs="todas">Seleccionar todas</button>
        <span class="cs-hueco"></span>
        <button class="btn sm tipo-owner" data-cs="owner" disabled>Owner</button>
        <button class="btn sm tipo-fondo" data-cs="fondo" disabled>Background</button>
      </div>
      <div class="cs-rejilla">${files.map((f, i) => `
        <div class="cs-foto" role="button" tabindex="0" data-csi="${i}" title="${escapeAttr(f.name)}">
          <span class="cs-lienzo"></span>
          <span class="sel-marca"></span>
          <span class="cs-tipo"></span>
        </div>`).join("")}</div>
      <div class="save-row">
        <button class="btn" data-cs="cancelar">Cancelar</button>
        <button class="btn primary" data-cs="subir" disabled></button>
      </div>`, () => {});
    d.querySelector(".modal-box").classList.add("cs-ventana");

    /*
     * Las miniaturas se hacen pequeñas y sólo cuando entran en pantalla.
     *
     * Antes cada una era un <img> con la foto original: con 46 fotos de móvil
     * de 12 megapíxeles, el navegador decodificaba y guardaba del orden de
     * 2 GB para pintar cuadraditos de 100 px, y todo iba a tirones. Ahora se
     * decodifica una, se dibuja en un lienzo de 180 px, se suelta el
     * original, y así de cuatro en cuatro según se va viendo.
     */
    const rejilla = d.querySelector(".cs-rejilla");
    const botones = [...d.querySelectorAll(".cs-foto")];
    const cola = [];
    let enMarcha = 0;
    const MINI_W = 180, MINI_H = 320;
    const miniatura = async (i) => {
      const f = files[i], hueco = botones[i].querySelector(".cs-lienzo");
      try {
        let fuente, soltar = () => {};
        try {
          // Con resizeWidth el navegador puede decodificar ya en pequeño.
          fuente = await createImageBitmap(f, { resizeWidth: MINI_W * 2, resizeQuality: "medium" });
          soltar = () => fuente.close();
        } catch {
          const url = URL.createObjectURL(f);
          fuente = new Image(); fuente.src = url;
          await fuente.decode();
          soltar = () => URL.revokeObjectURL(url);
        }
        const c = document.createElement("canvas");
        c.width = MINI_W; c.height = MINI_H;
        const x = c.getContext("2d");
        const w = fuente.width, h = fuente.height, k = Math.max(MINI_W / w, MINI_H / h);
        x.drawImage(fuente, (MINI_W - w * k) / 2, (MINI_H - h * k) / 2, w * k, h * k);
        soltar();
        if (!hecho) hueco.appendChild(c);
      } catch {
        if (!hecho) hueco.innerHTML = `<span class="cs-sin">${escapeHtml(f.name)}</span>`;
      }
    };
    const siguiente = () => {
      while (enMarcha < 4 && cola.length && !hecho) {
        const i = cola.shift(); enMarcha++;
        miniatura(i).finally(() => { enMarcha--; siguiente(); });
      }
    };
    const visor = new IntersectionObserver(entradas => {
      entradas.forEach(e => {
        if (!e.isIntersecting) return;
        visor.unobserve(e.target);
        cola.push(Number(e.target.dataset.csi));
      });
      siguiente();
    }, { root: rejilla, rootMargin: "300px" });
    /* Las primeras se piden ya, sin esperar al vigilante: medido, tarda unos
       800 ms en dar su primer aviso, y era justo el rato en que la ventana
       salía con los huecos vacíos. Las demás, según se hace scroll. */
    const PRIMERAS = 24;
    botones.forEach((b, i) => { if (i < PRIMERAS) cola.push(i); else visor.observe(b); });
    siguiente();

    const fin = (v) => {
      if (hecho) return; hecho = true;
      visor.disconnect();
      cierraDialogo(); resolve(v);
    };
    // Sólo se retocan las fotos que cambian, no las 46 en cada toque.
    const pintaFoto = (i) => {
      const b = botones[i], t = tipos.get(files[i]);
      b.classList.toggle("sel", sel.has(i));
      b.querySelector(".sel-marca").classList.toggle("on", sel.has(i));
      const et = b.querySelector(".cs-tipo");
      et.className = "cs-tipo" + (t ? " pill tipo-" + t : "");
      et.textContent = t ? TIPOS_FOTO[t].nombre : "";
    };
    const pinta = (cuales) => {
      (cuales || botones.map((_, i) => i)).forEach(pintaFoto);
      const faltan = files.filter(f => !tipos.has(f)).length;
      const todas = sel.size === files.length;
      d.querySelector('[data-cs="todas"]').textContent = todas ? "Quitar selección" : "Seleccionar todas";
      d.querySelectorAll('[data-cs="owner"], [data-cs="fondo"]').forEach(b => { b.disabled = !sel.size; });
      const subir = d.querySelector('[data-cs="subir"]');
      subir.disabled = faltan > 0;
      subir.textContent = faltan > 0
        ? `Faltan ${faltan} por marcar`
        : `Subir ${files.length} ${files.length === 1 ? "foto" : "fotos"}`;
    };

    d.addEventListener("click", e => {
      if (e.target === d) return fin(null);
      const foto = e.target.closest("[data-csi]");
      if (foto) { const i = Number(foto.dataset.csi); sel.has(i) ? sel.delete(i) : sel.add(i); return pinta([i]); }
      const b = e.target.closest("[data-cs]"); if (!b) return;
      const que = b.dataset.cs;
      if (que === "cancelar") return fin(null);
      if (que === "subir") return fin(tipos);
      if (que === "todas") { if (sel.size === files.length) sel.clear(); else files.forEach((_, i) => sel.add(i)); return pinta(); }
      if (que === "owner" || que === "fondo") {
        const tocadas = [...sel];
        tocadas.forEach(i => tipos.set(files[i], que)); sel.clear(); return pinta(tocadas);
      }
    });
    // Escape: montaDialogo quita la ventana; se da por cancelado.
    new MutationObserver((_, obs) => {
      if (!document.body.contains(d)) { obs.disconnect(); fin(null); }
    }).observe(document.body, { childList: true });
    pinta();
  });
}

/* La barra de avance de una subida, abajo del todo y dentro de la web. */
function progresoSubida(total) {
  document.getElementById("progSubida")?.remove();
  const el = document.createElement("div");
  el.id = "progSubida"; el.className = "prog-subida";
  el.innerHTML = `<span class="ps-txt">Preparando ${total} ${total === 1 ? "foto" : "fotos"}…</span><span class="ps-barra"><i></i></span>`;
  document.body.appendChild(el);
  const txt = el.querySelector(".ps-txt"), i = el.querySelector("i");
  return {
    avanza(n) {
      txt.textContent = `Subiendo ${n} de ${total}`;
      i.style.width = Math.round(n / total * 100) + "%";
    },
    fin() {
      txt.textContent = total === 1 ? "Foto lista" : `${total} fotos listas`;
      i.style.width = "100%";
      setTimeout(() => { el.classList.add("se-va"); setTimeout(() => el.remove(), 300); }, 1200);
    },
  };
}

async function loadFiles(fileList) {
  const files = Array.from(fileList)
    .filter(f => f.type.startsWith("image/") || esHeic(f));
  if (!files.length) return;
  const tipos = await clasificaSubida(files);
  if (!tipos) return;
  const nuevas = [];
  /* Una barra con el avance, y las fotos van apareciendo en la galería según
     se guardan. Antes no se veía nada hasta el final: con 48 fotos eran
     varios segundos con la pantalla quieta, sin saber si estaba haciendo algo. */
  let hechas = 0;
  const barra = progresoSubida(files.length);
  let pendientePintar = false;
  const pintaPoco = () => {
    if (pendientePintar) return;
    pendientePintar = true;
    setTimeout(() => { pendientePintar = false; updateImgCount(); if (state.view === "gallery") renderGallery(); }, 500);
  };
  let added = 0;
  const fallidas = [];
  const yaEstan = new Set(state.images.map(i => i.key));
  await enParalelo(files, 3, async (file) => { try {
    // Key con el tamaño ORIGINAL — re-subir el mismo archivo siempre dedup
    const key = imgDB.keyOf(file.name, file.size);
    if (yaEstan.has(key)) return;
    yaEstan.add(key);
    const tipo = tipos.get(file) || null;

    const original = await normalizarImagen(file);
    if (!original) { fallidas.push(file.name); return; }

    // Resize a 1920px para no cargar JPEGs de 5MB en memoria
    let blob = original;
    try { blob = await resizeImageBlob(original, 1920); } catch {}
    try { await imgDB.put(file.name, blob, key, tipo); } catch (e) { console.warn("DB put", e); }
    try { subirFotoANube(key, file.name, blob); } catch {}
    await new Promise(res => {
      const img = new Image();
      img.onload = () => { const o = { key, name: file.name, img, tipo }; state.images.push(o); nuevas.push(o); added++; pintaPoco(); res(); };
      img.onerror = () => { fallidas.push(file.name); res(); };
      img.src = URL.createObjectURL(blob);
    });
  } finally { hechas++; barra.avanza(hechas); } }).then(() => {}, () => {});
  barra.fin();
  if (fallidas.length) {
    aviso("No se han podido abrir: " + fallidas.join(", "), "error");
  }
  // Las marcas a la nube, todas en una petición.
  const conTipo = nuevas.filter(o => o.tipo);
  if (conTipo.length && state.user && window.sbFotos) {
    sbFotos.sbGuardarTipos(conTipo.map(o => ({ clave: o.key, tipo: o.tipo }))).catch(() => {});
  }
  // Dedup defensivo final
  const uniq = new Map(); state.images.forEach(im => uniq.set(im.key, im));
  state.images = [...uniq.values()];
  updateImgCount();
  if (added > 0) {
    // Las fotos nuevas sólo van a los frames que no tenían ninguna. Antes, si
    // a una secuencia le faltaba una sola, se le repartían todas de nuevo.
    resuelveFondos();
    state.sequences.forEach(s => {
      if (s.slides.some(sl => !sl.bgKey)) { assignRandomImages(s, { soloVacios: true }); guardarSecuencia(s); }
    });
    renderAll();
    if (state.active) { assignRandomImages(state.active, { soloVacios: true }); drawEditor(); renderThumbs(); }
  }
}
function updateImgCount() {
  const n = state.images.length;
  const el = $("#galCount"); if (el) el.textContent = `${n} ${n === 1 ? "imagen" : "imágenes"}`;
}
/* La galería vieja era común a todo el navegador. La primera vez que alguien
   entra tras el cambio, sus fotos se mueven a su propia galería y la común se
   borra, para que no queden fotos de nadie sueltas. */
async function migrarGaleriaAntigua() {
  const YA = "abmedia_galeria_migrada";
  if (localStorage.getItem(YA)) return;
  try {
    const filas = await new Promise((res) => {
      const req = indexedDB.open("abmedia_images_v2", 1);
      req.onupgradeneeded = () => { try { req.transaction.abort(); } catch {} res([]); };
      req.onerror = () => res([]);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("files")) { db.close(); return res([]); }
        const tx = db.transaction("files", "readonly");
        const g = tx.objectStore("files").getAll();
        g.onsuccess = () => { const r = g.result || []; db.close(); res(r); };
        g.onerror = () => { db.close(); res([]); };
      };
    });
    for (const r of filas) {
      if (r && r.blob) await imgDB.put(r.name, r.blob, r.key);
    }
    if (filas.length) console.info(`Galería: ${filas.length} fotos movidas a tu cuenta.`);
    try { indexedDB.deleteDatabase("abmedia_images_v2"); } catch {}
  } catch (e) {
    console.warn("migrarGaleriaAntigua", e);
  }
  localStorage.setItem(YA, "1");
}

/* Sube la foto a la nube sin frenar la interfaz. Si falla, la foto sigue
   estando en este equipo; se reintentará al volver a entrar. */
function subirFotoANube(key, nombre, blob) {
  if (!state.user || !window.sbFotos) return;
  sbFotos.sbSubirFoto(key, blob).catch(e => console.warn("subir foto", e));
}

/* Trae de la nube las fotos que no estén ya en este equipo, para que la
   galería sea la misma desde cualquier ordenador. */
async function sincronizarFotos() {
  if (!state.user || !window.sbFotos) return;
  try {
    const remotas = await sbFotos.sbListarFotos();
    if (remotas === null) return 0;   // no se ha podido mirar: no se toca nada
    // Sin fotos en la nube también se sigue: puede que se borraran todas desde
    // otro equipo y haya frames apuntando a fotos que ya no existen.

    const locales = new Set(state.images.map(i => i.key));
    const uid = state.user.id;
    let traidas = 0;
    const claveDe = (obj) => decodeURIComponent(obj.name.replace(/\.jpg$/, "").replace(/_/g, "%"));
    const enLaNube = new Set(remotas.map(claveDe));
    await enParalelo(remotas, 4, async (obj) => {
      // el nombre del objeto contiene la clave original
      const key = decodeURIComponent(obj.name.replace(/\.jpg$/, "").replace(/_/g, "%"));
      if (locales.has(key)) return;
      locales.add(key);
      const blob = await sbFotos.sbDescargarFoto(obj.name);
      if (!blob) return;
      const nombre = key.split("|")[0] || obj.name;
      try { await imgDB.put(nombre, blob, key); } catch {}
      const o = await blobToImage(blob, nombre);
      if (o) { o.key = key; state.images.push(o); traidas++; }
    });
    if (traidas) { updateImgCount(); if (state.view === "gallery") renderAll(); }
    await subirPendientes();
    // Ya están todas las fotos que hay: cada frame vuelve a la suya.
    resuelveFondos();
    // Una foto que no está ni aquí ni en la nube se borró desde otro equipo:
    // sólo esos frames reciben otra. Uno cuya foto no ha podido bajar ahora
    // (sin conexión, por ejemplo) se deja esperando: la foto sigue existiendo.
    const aqui = new Set(state.images.map(i => i.key));
    state.sequences.forEach(seq => {
      if (seq.slides.some(sl => sl.bgKey && !aqui.has(sl.bgKey) && !enLaNube.has(sl.bgKey))) {
        seq.slides.forEach(sl => { if (sl.bgKey && !aqui.has(sl.bgKey) && !enLaNube.has(sl.bgKey)) sl.bgKey = null; });
        assignRandomImages(seq, { soloVacios: true });
        guardarSecuencia(seq);
      }
    });
    if (state.active) { drawEditor(); renderThumbs(); }
    if (state.view === "calendar") renderCalendar();
    return traidas;
  } catch (e) {
    console.warn("sincronizarFotos", e);
  }
}

/* Las que están en este equipo pero todavía no en la nube. */
async function subirPendientes() {
  try {
    const remotas = await sbFotos.sbListarFotos();
    // Si no se ha podido mirar qué hay, no se sube nada: se volvería a subir todo.
    if (!remotas) return;
    const yaSubidas = new Set(remotas.map(o =>
      decodeURIComponent(o.name.replace(/\.jpg$/, "").replace(/_/g, "%"))));
    const filas = await imgDB.getAll();
    for (const r of filas) {
      const key = r.key || imgDB.keyOf(r.name, r.size || 0);
      if (yaSubidas.has(key) || !r.blob) continue;
      await sbFotos.sbSubirFoto(key, r.blob);
    }
  } catch (e) { console.warn("subirPendientes", e); }
}

/*
 * Owner o Background.
 *
 * Owner es la foto en la que sale la persona; Background, todo lo demás
 * —un paisaje, el portátil, la mesa—. La diferencia importa porque una
 * secuencia de stories funciona cuando abre con una cara: es lo que para el
 * dedo. Y el frame que pide algo —el CTA— también tiene que ser la persona,
 * porque a una cara se le contesta y a un paisaje no.
 */
const TIPOS_FOTO = {
  owner: { nombre: "Owner" },
  fondo: { nombre: "Background" },
};
const pillTipo = (t) => TIPOS_FOTO[t]
  ? `<span class="pill tipo-${t}">${TIPOS_FOTO[t].nombre}</span>` : "";

/* Marca varias fotos del mismo tipo: cada una en este navegador y todas
   juntas en la nube, en una sola petición. */
async function ponTipos(fotos, tipo) {
  for (const im of fotos) await ponTipoFoto(im, tipo);
  if (state.user && window.sbFotos && fotos.length) {
    try { await sbFotos.sbGuardarTipos(fotos.map(im => ({ clave: im.key, tipo }))); } catch (e) { console.warn("tipos nube", e); }
  }
}

/*
 * Al arrancar: la marca de la nube manda, porque es la que ve cualquier
 * ordenador. Y lo que esté marcado sólo aquí —lo de antes de que existiera
 * la tabla— se sube, para no perderlo.
 */
async function sincronizarTipos() {
  if (!state.user || !window.sbFotos) return;
  try {
    const nube = await sbFotos.sbLeerTipos();
    const subir = [];
    for (const im of state.images) {
      const t = nube[im.key];
      if (t && t !== im.tipo) await ponTipoFoto(im, t);
      else if (!t && im.tipo) subir.push({ clave: im.key, tipo: im.tipo });
    }
    if (subir.length) await sbFotos.sbGuardarTipos(subir);
    if (state.view === "gallery") renderGallery();
  } catch (e) { console.warn("sincronizarTipos", e); }
}

/* Cambia el tipo de una foto guardada. Se relee el registro para no perder
   el blob: `put` reemplaza la fila entera. */
async function ponTipoFoto(im, tipo) {
  im.tipo = tipo;
  try {
    const db = await imgDB.open();
    await new Promise((res, rej) => {
      const tx = db.transaction(imgDB.STORE, "readwrite");
      const st = tx.objectStore(imgDB.STORE);
      const g = st.get(im.key);
      g.onsuccess = () => { const r = g.result; if (r) { r.tipo = tipo; st.put(r); } };
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch (e) { console.warn("tipo de foto", e); }
}

async function loadImagesFromDB() {
  state.images = []; // limpia siempre: si bootLoggedIn se llama 2 veces no se duplica
  try {
    const rows = await imgDB.getAll();
    const seen = new Set();
    const unicas = rows.filter(r => {
      const key = r.key || imgDB.keyOf(r.name, r.size || 0);
      if (seen.has(key)) return false;
      seen.add(key); r._key = key; return true;
    });
    // Se decodifican varias a la vez pero se guardan en su orden, para que
    // la galería no salga barajada en cada arranque.
    const hechas = new Array(unicas.length);
    await enParalelo(unicas, 6, async (r, k) => {
      const o = await blobToImage(r.blob, r.name);
      if (o) { o.key = r._key; o.tipo = TIPOS_FOTO[r.tipo] ? r.tipo : null; hechas[k] = o; }
    });
    state.images.push(...hechas.filter(Boolean));
  } catch (e) { console.warn("loadImagesFromDB", e); }
  updateImgCount();
}
/* Con la pregunta dentro de la web: el confirm() del navegador sale fuera,
   con otra letra y en inglés. */
function clearGallery() {
  pregunta({
    titulo: "Vaciar la galería",
    sub: "Se borran también de la nube, así que desaparecen de todos tus dispositivos. No se puede deshacer.",
    ok: "Vaciar", peligro: true,
    alAceptar: vaciaGaleria,
  });
}
async function vaciaGaleria() {
  const claves = state.images.map(i => i.key);
  await imgDB.clear();
  if (state.user && window.sbFotos) {
    try { await sbFotos.sbBorrarTodasLasFotos(); } catch (e) { console.warn("borrar nube", e); }
    try { await sbFotos.sbBorrarTipos(claves); } catch {}
  }
  FOTOS_SEL.clear();
  state.images = [];
  state.sequences.forEach(s => { s.slides.forEach(sl => ponFondo(sl, -1)); guardarSecuencia(s); });
  updateImgCount();
  renderAll();
}
async function deleteImage(index) {
  const im = state.images[index];
  if (im?.key) await imgDB.deleteByKey(im.key);
  if (im?.key && state.user && window.sbFotos) {
    try { await sbFotos.sbBorrarFoto(im.key); } catch (e) { console.warn("borrar foto nube", e); }
    try { await sbFotos.sbBorrarTipos([im.key]); } catch {}
  }
  if (im?.key) FOTOS_SEL.delete(im.key);
  if (im?._mini && im._mini.startsWith("blob:")) URL.revokeObjectURL(im._mini);
  state.images.splice(index, 1);
  /* Sólo cambia la foto en los frames que usaban la que se ha borrado. Antes
     se volvían a repartir las fotos de todas las secuencias y se perdían los
     fondos elegidos a mano. */
  resuelveFondos();
  state.sequences.forEach(s => {
    if (im?.key && s.slides.some(sl => sl.bgKey === im.key)) {
      assignRandomImages(s, { soloVacios: true, huerfanos: true });
      guardarSecuencia(s);
    }
  });
  if (state.active) { drawEditor(); renderThumbs(); }
  updateImgCount();
  renderAll();
}

/* =========================================================================
 *  Vistas
 * ========================================================================= */
function setView(view) {
  state.view = view;
  try { localStorage.setItem("abmedia_vista", view); } catch {}
  $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.view === view));
  $("#avisosTab").classList.toggle("activo", view === "avisos");
  ["library", "mias", "gallery", "gestion", "calendar", "avisos"].forEach(v => $("#view-" + v).classList.toggle("hidden", v !== view));
  if (view === "avisos") renderAvisos();
  if (view === "mias") renderMias();
  renderAll();
}
function renderAll() {
  if (state.view === "library") renderLibrary();
  else if (state.view === "mias") renderMias();
  else if (state.view === "gallery") renderGallery();
  else if (state.view === "gestion") renderGestion();
  else if (state.view === "calendar") renderCalendar();
}

/* ---------------------------------------------------------------------- *
 *  BIBLIOTECA
 * ---------------------------------------------------------------------- */
/* La biblioteca son sólo las plantillas de ABMedia: las del catálogo y las
   que se hayan publicado desde el panel. Lo del usuario vive en "Mis
   secuencias", para no tener lo mismo en dos sitios. */
function getCategoryItems(catKey) {
  return CATALOG
    .map(c => ({ ...c, isUser: false }))
    .filter(it => !catKey || it.category === catKey);
}

function renderLibrary() {
  const todas = getCategoryItems(null);
  const cat = state.libraryCat || "all";
  const q = (state.libraryBusca || "").trim().toLowerCase();

  $("#libSub").textContent = `${todas.length} plantillas de ABMedia, por categoría.`;

  $("#libCat").innerHTML = [["all", "Todas"], ...ORDEN_CATEGORIAS.map(k => [k, CATEGORIES[k].name])]
    .map(([k, nom]) => `<button class="${cat === k ? "active" : ""}" data-libcat="${k}">${escapeHtml(nom)} <span class="dim nums">${
      k === "all" ? todas.length : todas.filter(i => i.category === k).length}</span></button>`).join("");

  const lista = todas.filter(i =>
    (cat === "all" || i.category === cat) &&
    (!q || (i.title || "").toLowerCase().includes(q)));

  $("#catalogGrid").innerHTML = tablaBiblioteca(lista, cat);
}

/**
 * La biblioteca en una tabla, agrupada por categoría y con todo en una línea.
 * Cada grupo lleva debajo del rótulo para qué sirve esa categoría: era lo
 * único que aportaba el mosaico que había antes, y así no se pierde.
 */
function tablaBiblioteca(lista, catSel) {
  const plegados = state.libPlegados || [];
  const grupos = catSel === "all" ? ORDEN_CATEGORIAS : [catSel];
  const cuerpo = grupos.map(key => {
    const c = CATEGORIES[key];
    const items = lista.filter(i => i.category === key);
    if (!items.length && catSel === "all") return "";
    const abierto = !plegados.includes(key);
    return `<div class="vt-group">
      <button class="vt-group-head" aria-expanded="${abierto}" data-libplegar="${key}">
        <span class="vt-caret${abierto ? " open" : ""}">›</span>
        <span class="pill cat-${key}">${escapeHtml(c.name)}</span>
        <span class="tiny dim nums">${items.length || "—"}</span>
      </button>
      ${abierto ? `<p class="vt-group-desc">${escapeHtml(c.desc)}</p>
      <div class="vt-rows">
        <div class="vt-row vt-lib vt-head"><span class="vt-col">Secuencia</span><span class="vt-col">Objetivo</span><span class="vt-col">Frames</span><span class="vt-col vt-right"></span></div>
        ${items.length ? items.map(filaBiblioteca).join("") : '<div class="board-empty">Nada aquí</div>'}
      </div>` : ""}
    </div>`;
  }).join("");
  return `<div class="vt">${cuerpo || '<p class="empty">No hay plantillas que coincidan con la búsqueda.</p>'}</div>`;
}

/**
 * Coger una plantilla de la biblioteca y meterla en la planificación.
 *
 * Antes se creaba siempre como borrador y se abría el editor sin más. El
 * problema es que la planificación es justo lo que hay que decidir en ese
 * momento —cuándo sale y en qué punto está—, y quedaba para después, que es
 * cuando se olvida. Ahora se pregunta aquí, con la plantilla delante y sus
 * datos a la vista, y el editor se abre ya con todo puesto.
 */
/*
 * «Usar» en la biblioteca abre primero la secuencia como se vería en
 * Instagram: frame grande, barras de progreso arriba y toques a los lados
 * para pasar. Así se lee y se decide antes de crear nada. Las fotos que salen
 * en la vista previa son las que se quedan si se usa.
 */
function verPlantilla(id) {
  const item = CATALOG.find(x => x.id === id);
  if (!item) return;
  const cat = CATEGORIES[item.category] || CATEGORIES.venta;
  _peek = { lib: id };
  $("#seqPeekTitle").textContent = item.title;
  const etiqueta = $("#seqPeekCat");
  etiqueta.textContent = cat.name;
  etiqueta.className = "peek-cat pill cat-" + (item.category || "venta");
  const n = item.slides.length;
  $("#seqPeekWhen").textContent = `${n} ${n === 1 ? "story" : "stories"}${item.objective ? " · " + item.objective : ""}`;
  $("#seqPeekRemove").classList.add("hidden");
  $("#seqPeekOtra").classList.add("hidden");
  $("#seqPeekOpen").textContent = "Usar esta secuencia";
  _peekSeq = fromCatalog(id, { id: -1 });
  _peekFrame = 0;
  pintaVisor();
  $("#seqPeekModal").classList.remove("hidden");
}

function usarPlantilla(id, vista) {
  const item = CATALOG.find(x => x.id === id);
  if (!item) return;
  const c = CATEGORIES[item.category] || CATEGORIES.venta;
  pideDato({
    titulo: item.title,
    sub: `${c.name} · ${item.slides.length} ${item.slides.length === 1 ? "story" : "stories"}${item.objective ? " · " + item.objective : ""}`,
    campos: [
      { id: "t", tipo: "text", etiqueta: "Título", valor: item.title },
      { id: "e", tipo: "select", etiqueta: "Estado", valor: "draft",
        opciones: ORDEN_ESTADOS.map(k => [k, STATUS[k].label]) },
      { id: "f", tipo: "date", etiqueta: "Día (opcional)", valor: "" }
    ],
    ok: "Crear y abrir",
    alAceptar: (v) => {
      const seq = fromCatalog(item.id, { status: v.e || "draft" });
      if (v.t.trim()) seq.title = v.t.trim();
      if (vista) seq.slides.forEach((sl, i) => {
        const o = vista.slides[i];
        if (o) { sl.bgIndex = o.bgIndex; sl.bgKey = o.bgKey; }
      });
      state.sequences.unshift(seq);
      // La fecha se pone después de meterla en la lista: setScheduleForSequence
      // busca la secuencia por id y si no está todavía no encuentra nada.
      if (v.f) { setScheduleForSequence(seq, v.f); seq.scheduledDate = v.f; }
      persist();
      openEditor(seq.id);
    }
  });
}

function filaBiblioteca(item) {
  return `<div class="vt-row vt-lib">
    <div class="vt-title"><span class="vt-name"><span class="truncate">${escapeHtml(item.title)}</span></span></div>
    <div class="vt-obj truncate">${item.objective ? escapeHtml(item.objective) : "—"}</div>
    <div class="vt-pts"><span class="vt-cell nums">${item.slides.length}</span></div>
    <div class="vt-right"><button class="btn sm" data-usar="${escapeAttr(item.id)}">Usar</button></div>
  </div>`;
}

/* ------------------ Desplegables y fechas propios ------------------------
   Los mismos que Content OS: el desplegable del sistema se abre con otra
   letra y otro aspecto, y el calendario nativo de fecha es de cada navegador.
   El <select>/<input> original se queda oculto y sigue siendo la fuente del
   valor, así que el resto del código no cambia. */
const SVG_CHEV = '<svg class="ds-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
const SVG_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>';
const SVG_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9h18"/></svg>';
const dos2 = n => String(n).padStart(2, "0");
const fmtFecha = v => v ? new Date(v + "T12:00").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "";

function mejorarCampos(raiz = document) {
  raiz.querySelectorAll("select").forEach(sel => {
    if (sel._pinta) return;
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "ds-campo";
    sel.after(btn); sel.hidden = true;
    sel._pinta = () => {
      const o = sel.selectedOptions[0];
      const cat = sel.id === "catSelect" || sel.id === "newSeqCat" || sel.dataset.cat != null;
      btn.innerHTML = (cat && o ? `<i class="ds-punto cat-${o.value}"></i>` : "") +
        "<span>" + escapeHtml(o?.textContent || "Elegir…") + "</span>" + SVG_CHEV;
    };
    sel._pinta(); sel.addEventListener("change", sel._pinta);
    btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); abreDesplegable(sel, btn); });
  });
  raiz.querySelectorAll('input[type="date"]').forEach(inp => {
    if (inp._pinta) return;
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "fp-campo";
    inp.after(btn); inp.style.display = "none";
    inp._pinta = () => {
      btn.innerHTML = SVG_CAL + "<span>" + (inp.value ? fmtFecha(inp.value) : "Elegir fecha") + "</span>";
      btn.classList.toggle("vacio", !inp.value);
      btn.classList.toggle("hidden", inp.classList.contains("hidden"));
    };
    inp._pinta(); inp.addEventListener("change", inp._pinta);
    new MutationObserver(inp._pinta).observe(inp, { attributes: true, attributeFilter: ["class"] });
    btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); abreSelectorFecha(inp, btn); });
  });
}
// Tras poner un valor por código (sin evento change) hay que repintar el botón
function refrescaCampos(raiz = document) {
  raiz.querySelectorAll("select, input[type=date]").forEach(x => x._pinta && x._pinta());
}
function cierraDesplegable() {
  document.querySelector(".ds-lista")?.remove();
  document.querySelector(".ds-campo.abierto")?.classList.remove("abierto");
}
function colocaPop(pop, btn) {
  const r = btn.getBoundingClientRect(), alto = pop.offsetHeight;
  const arriba = r.bottom + alto + 8 > innerHeight && r.top - alto - 8 > 0;
  pop.style.top = (arriba ? r.top - alto - 6 : r.bottom + 6) + "px";
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8)) + "px";
}
function abreDesplegable(sel, btn) {
  const abierto = btn.classList.contains("abierto");
  cierraDesplegable(); cierraSelectorFecha();
  if (abierto) return;
  btn.classList.add("abierto");
  const cat = sel.id === "catSelect" || sel.id === "newSeqCat";
  const lista = document.createElement("div"); lista.className = "ds-lista";
  lista.innerHTML = [...sel.options].map(o => `<button type="button" class="ds-op${o.selected ? " activo" : ""}" data-valor="${escapeAttr(o.value)}">
    <span>${cat ? `<i class="ds-punto cat-${o.value}"></i>` : ""}${escapeHtml(o.textContent)}</span>${o.selected ? SVG_CHECK : ""}</button>`).join("");
  document.body.appendChild(lista);
  lista.style.minWidth = btn.getBoundingClientRect().width + "px";
  colocaPop(lista, btn);
  lista.querySelectorAll(".ds-op").forEach(op => op.addEventListener("click", () => {
    sel.value = op.dataset.valor;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    cierraDesplegable();
  }));
}
function cierraSelectorFecha() { document.querySelector(".fp")?.remove(); }
function abreSelectorFecha(inp, btn) {
  const yaAbierto = document.querySelector(".fp");
  cierraSelectorFecha(); cierraDesplegable();
  if (yaAbierto && yaAbierto._de === inp) return;
  const hoy = new Date(), kHoy = `${hoy.getFullYear()}-${dos2(hoy.getMonth() + 1)}-${dos2(hoy.getDate())}`;
  const sel = inp.value || null;
  let mes = sel ? new Date(sel + "T12:00") : new Date(hoy);
  mes = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const pop = document.createElement("div"); pop.className = "fp"; pop._de = inp;
  document.body.appendChild(pop);
  const aplica = v => { inp.value = v; inp.dispatchEvent(new Event("change", { bubbles: true })); inp._pinta(); };
  const pinta = () => {
    const y = mes.getFullYear(), m = mes.getMonth();
    const hueco = (new Date(y, m, 1).getDay() + 6) % 7, dias = new Date(y, m + 1, 0).getDate();
    let celdas = "<span></span>".repeat(hueco);
    for (let d = 1; d <= dias; d++) {
      const k = `${y}-${dos2(m + 1)}-${dos2(d)}`;
      celdas += `<button type="button" data-dia="${k}" class="fp-dia${k === sel ? " activo" : ""}${k === kHoy ? " hoy" : ""}">${d}</button>`;
    }
    const nombreMes = MONTHS_ES[m].charAt(0).toUpperCase() + MONTHS_ES[m].slice(1);
    pop.innerHTML = `<div class="fp-cab"><strong>${nombreMes} ${y}</strong><div><button type="button" class="fp-nav" data-mv="-1">‹</button><button type="button" class="fp-nav" data-mv="1">›</button></div></div>
      <div class="fp-rejilla">${["L", "M", "X", "J", "V", "S", "D"].map(d => `<span class="fp-sem">${d}</span>`).join("")}${celdas}</div>
      <div class="fp-pie"><button type="button" class="fp-link" data-accion="borrar">Borrar</button><button type="button" class="fp-link" data-accion="hoy">Hoy</button></div>`;
    pop.querySelectorAll("[data-mv]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); mes = new Date(y, m + +b.dataset.mv, 1); pinta(); }));
    pop.querySelectorAll("[data-dia]").forEach(b => b.addEventListener("click", () => { aplica(b.dataset.dia); cierraSelectorFecha(); }));
    pop.querySelector('[data-accion="borrar"]').addEventListener("click", () => { aplica(""); cierraSelectorFecha(); });
    pop.querySelector('[data-accion="hoy"]').addEventListener("click", () => { aplica(kHoy); cierraSelectorFecha(); });
  };
  pinta();
  colocaPop(pop, btn);
}
document.addEventListener("mousedown", e => {
  if (!e.target.closest(".fp, .fp-campo")) cierraSelectorFecha();
  if (!e.target.closest(".ds-lista, .ds-campo")) cierraDesplegable();
});
// Escape cierra primero el desplegable abierto, no la ventana que hay debajo
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || !document.querySelector(".fp, .ds-lista")) return;
  cierraSelectorFecha(); cierraDesplegable(); e.stopImmediatePropagation();
});
window.addEventListener("resize", () => { cierraSelectorFecha(); cierraDesplegable(); });

/* Aviso breve dentro de la propia web. Las ventanas del navegador cortan
   el trabajo y se salen de la estética. */
function aviso(texto, tipo = "ok") {
  const caja = document.getElementById("toasts");
  if (!caja) return;
  const el = document.createElement("div");
  el.className = "toast " + tipo;
  el.textContent = texto;
  caja.appendChild(el);
  requestAnimationFrame(() => el.classList.add("visible"));
  setTimeout(() => {
    el.classList.remove("visible");
    setTimeout(() => el.remove(), 320);
  }, tipo === "error" ? 5200 : 3600);
}

/* ---------------------------------------------------------------------- *
 *  MIS SECUENCIAS
 *  Todo lo del usuario, venga de cero o adaptado de la biblioteca.
 * ---------------------------------------------------------------------- */
function renderMias() {
  const grid = $("#miasGrid");
  const todas = state.sequences || [];
  const filtro = state.miasFiltro && state.miasFiltro !== "todas" ? state.miasFiltro : "all";
  $("#miasFiltro").innerHTML = [["all", "Todas"], ...ORDEN_CATEGORIAS.map(k => [k, CATEGORIES[k].name])]
    .map(([k, nom]) => `<button class="${filtro === k ? "active" : ""}" data-miascat="${k}">${escapeHtml(nom)} <span class="dim nums">${
      k === "all" ? todas.length : todas.filter(s => s.category === k).length}</span></button>`).join("");
  const lista = filtro === "all" ? todas : todas.filter(s => s.category === filtro);
  $("#miasCount").textContent = `${todas.length} ${todas.length === 1 ? "secuencia" : "secuencias"}`;

  grid.innerHTML = "";
  if (!lista.length) {
    grid.innerHTML = `<p class="empty">${
      filtro === "todas"
        ? "Todavía no has guardado ninguna. Coge una de la biblioteca o crea una nueva y pulsa Guardar."
        : "No tienes ninguna secuencia de esta categoría."}</p>`;
    return;
  }
  lista.forEach(seq => grid.appendChild(tarjetaMia(seq)));
}

function tarjetaMia(seq) {
  const cat = CATEGORIES[seq.category] || CATEGORIES.venta;
  const est = estadoDe(seq);
  const info = STATUS[est];

  const card = document.createElement("div");
  card.className = "card";
  card.appendChild(makeCardCanvas(seq.slides[0], seq.style));

  const badge = document.createElement("span");
  badge.className = "frames-badge";
  badge.textContent = `${seq.slides.length} frames`;
  card.appendChild(badge);

  const fecha = seq.scheduledDate
    ? new Date(seq.scheduledDate + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })
    : null;

  const box = document.createElement("div");
  box.className = "card-info";
  box.innerHTML =
    `<div class="card-row">
       <h3>${escapeHtml(seq.title || "Secuencia")}</h3>
       <span class="cat-tag pill cat-${escapeAttr(seq.category || "venta")}">${cat.name}</span>
     </div>
     <p class="estado-linea">
       <span class="estado-punto ${info.cls}"></span>
       <span>${info.label}${fecha ? ` · ${fecha}` : ""}</span>
     </p>
     <div class="card-acciones">
       <button class="btn btn-primary sm card-cta" data-act="abrir">Abrir</button>
       <button class="card-borrar" data-act="del" title="Borrar" aria-label="Borrar">
         <svg viewBox="0 0 24 24"><path d="M4 7 H20 M9 7 V5 a1 1 0 0 1 1 -1 h4 a1 1 0 0 1 1 1 v2 M6.5 7 L7.5 20 a1 1 0 0 0 1 1 h7 a1 1 0 0 0 1 -1 L18 7"/></svg>
       </button>
     </div>`;

  box.querySelector('[data-act="abrir"]').addEventListener("click", e => {
    e.stopPropagation(); openEditor(seq.id);
  });
  // Borra de un clic, sin preguntar
  box.querySelector('[data-act="del"]').addEventListener("click", e => {
    e.stopPropagation();
    eliminaSecuencias([seq]);   // la misma que usan Gestión y el calendario
  });

  card.appendChild(box);
  card.addEventListener("click", () => openEditor(seq.id));
  return card;
}

/* ---------------------------------------------------------------------- *
 *  GALERÍA
 * ---------------------------------------------------------------------- */
function renderGallery() {
  updateImgCount();
  const grid = $("#galleryGrid"); grid.innerHTML = "";
  const todas = state.images || [];
  const ctx = state.galCtx || "all";

  // El filtro: sólo los contextos que existan, más «sin contexto» si los hay.
  const cuenta = k => k === "all" ? todas.length : todas.filter(i => i.tipo === k).length;
  $("#galCtx").innerHTML = [["all", "Todas"], ...Object.entries(TIPOS_FOTO).map(([k, t]) => [k, t.nombre])]
    .map(([k, n]) => `<button class="${ctx === k ? "active" : ""} ${k !== "all" ? "tipo-" + k : ""}" data-galctx="${k}">${escapeHtml(n)} <span class="dim nums">${cuenta(k)}</span></button>`)
    .join("");

  $("#galBarra").classList.toggle("hidden", !todas.length);
  if (!todas.length) {
    grid.innerHTML = `<p class="empty">Aún no has cargado imágenes. Pulsa el botón de arriba para elegir tu carpeta.</p>`;
    return pintaBarraFotos();
  }

  const visibles = todas
    .map((im, i) => ({ im, i }))
    .filter(({ im }) => ctx === "all" || im.tipo === ctx);

  if (!visibles.length) {
    grid.innerHTML = `<p class="empty">Todavía no has marcado ninguna como ${TIPOS_FOTO[ctx] ? TIPOS_FOTO[ctx].nombre : "esa"}.</p>`;
    return pintaBarraFotos();
  }

  grid.classList.toggle("eligiendo", FOTOS_SEL.size > 0);
  visibles.forEach(({ im, i }) => {
    const cell = document.createElement("div");
    cell.className = "gallery-cell" + (FOTOS_SEL.has(im.key) ? " sel" : "");
    const img = document.createElement("img");
    img.decoding = "async";
    img.title = im.name;   // el nombre sólo al pasar por encima: en la foto no aporta nada
    const mini = miniDe(im, url => { img.src = url; });
    if (mini) img.src = mini;
    const x = document.createElement("button"); x.className = "x"; x.textContent = "✕"; x.title = "Eliminar";
    x.addEventListener("click", e => { e.stopPropagation(); deleteImage(i); });

    const marca = document.createElement("span");
    marca.className = "sel-marca" + (FOTOS_SEL.has(im.key) ? " on" : "");
    marca.title = "Seleccionar";
    marca.addEventListener("click", e => {
      e.stopPropagation();
      alternaFoto(im.key, cell, marca);
    });

    cell.appendChild(img); cell.appendChild(x); cell.appendChild(marca);
    /* La primera se marca con la casilla. En cuanto hay alguna marcada, un
       toque en cualquier punto de la foto marca o desmarca: ir apuntando a
       una casilla de 16 px foto por foto es lo que hacía pesado clasificar. */
    cell.addEventListener("click", () => {
      if (!FOTOS_SEL.size) return;
      alternaFoto(im.key, cell, marca);
    });
    if (TIPOS_FOTO[im.tipo]) {
      const et = document.createElement("span");
      et.className = "gal-ctx pill tipo-" + im.tipo;
      et.textContent = TIPOS_FOTO[im.tipo].nombre;
      cell.appendChild(et);
    }
    grid.appendChild(cell);
  });
  pintaBarraFotos();
}

/*
 * La miniatura de cada foto para la galería, hecha una sola vez.
 *
 * Antes cada casilla de 130 px cargaba la foto de 1920 px: repintar la
 * galería con 48 fotos tardaba medio segundo y cada toque al seleccionar,
 * 120 ms, que es un tirón que se nota. Ahora se hace una de 260 px la
 * primera vez que hace falta y se guarda con la foto.
 */
function miniDe(im, alHacer) {
  if (im._mini) return im._mini;
  if (!im._haciendoMini) {
    im._haciendoMini = true;
    const W = 260, H = 462;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const w = im.img.naturalWidth || im.img.width, h = im.img.naturalHeight || im.img.height;
    const k = Math.max(W / w, H / h);
    c.getContext("2d").drawImage(im.img, (W - w * k) / 2, (H - h * k) / 2, w * k, h * k);
    c.toBlob(b => {
      im._mini = b ? URL.createObjectURL(b) : im.img.src;
      im._haciendoMini = false;
      if (alHacer) alHacer(im._mini);
    }, "image/webp", 0.8);
  }
  return null;
}

/* Las fotos marcadas, para marcarlas como owner o background de una vez. */
const FOTOS_SEL = new Set();
/* Marca o desmarca una foto tocando sólo esa casilla, no toda la galería. */
function alternaFoto(key, cell, marca) {
  const on = !FOTOS_SEL.has(key);
  on ? FOTOS_SEL.add(key) : FOTOS_SEL.delete(key);
  cell.classList.toggle("sel", on);
  marca.classList.toggle("on", on);
  $("#galleryGrid").classList.toggle("eligiendo", FOTOS_SEL.size > 0);
  pintaBarraFotos();
}

const fotosVisibles = () => {
  const ctx = state.galCtx || "all";
  return (state.images || []).filter(im => ctx === "all" || im.tipo === ctx);
};

function pintaBarraFotos() {
  const n = FOTOS_SEL.size;
  let b = document.getElementById("barraFotos");
  if (!n) { if (b) b.remove(); document.body.classList.remove("con-barra-sel"); return; }
  if (!b) { b = document.createElement("div"); b.id = "barraFotos"; b.className = "barra-sel"; document.body.appendChild(b); }
  document.body.classList.add("con-barra-sel");
  const visibles = fotosVisibles();
  const todas = visibles.length && visibles.every(im => FOTOS_SEL.has(im.key));
  b.innerHTML = `<span class="bs-n"><b>${n}</b> ${n === 1 ? "foto" : "fotos"}</span>` +
    `<button class="btn sm ghost" data-galpon="${todas ? "ninguna" : "todas"}">${todas ? "Quitar todas" : "Seleccionar todas"}</button>` +
    Object.entries(TIPOS_FOTO).map(([k, t]) =>
      `<button class="btn sm tipo-${k}" data-galpon="${k}">${t.nombre}</button>`).join("") +
    `<button class="btn sm ghost" data-galpon="nada">Cancelar</button>`;
}

/* ---------------------------------------------------------------------- *
 *  IDEAS (tipo tabla)
 * ---------------------------------------------------------------------- */
/* ---------------------------------------------------------------------- *
 *  GESTIÓN DE STORIES
 *
 *  Lo mismo que «Gestión de vídeos» en Content OS, con las secuencias en
 *  lugar de las piezas: la lista agrupada por estado, marcar varias y
 *  hacerles lo mismo a todas de una vez.
 *
 *  Sustituye a «Ideas de stories», que era un cuaderno suelto: apuntabas una
 *  frase y la convertías en secuencia. Todo lo que hacía falta de verdad —ver
 *  qué hay, en qué estado y cuándo sale— no estaba en ninguna parte.
 * ---------------------------------------------------------------------- */

/* Lo marcado vive fuera del pintado: la vista se rehace entera a cada cambio
   y si no se perdería la selección en cuanto se tocara nada. */
const SELECCION = new Set();
let ultimaMarcada = null;          // para marcar un rango con Mayúsculas

const ORDEN_ESTADOS = ["draft", "scheduled", "published"];
const ORDEN_CATEGORIAS = Object.keys(CATEGORIES);

/* Ojo con el tipo: los ids de las secuencias son números, pero lo que se lee
   del HTML (data-sel, data-arrastra…) siempre es texto, y "1" !== 1. En la
   selección se guarda todo como texto y se compara siempre con String(id). */
const seleccionadas = () => (state.sequences || []).filter(s => SELECCION.has(String(s.id)));

function limpiaSeleccion() { SELECCION.clear(); ultimaMarcada = null; renderGestion(); }

/** La casilla que se pone en cada fila o tarjeta. */
function marca(id) {
  const k = String(id);
  return `<span class="sel-marca${SELECCION.has(k) ? " on" : ""}" data-sel="${k}" role="checkbox"
    aria-checked="${SELECCION.has(k)}" tabindex="0" title="Seleccionar"></span>`;
}

/**
 * Marca o desmarca. Con Mayúsculas pulsadas coge todo lo que haya entre la
 * última que se tocó y ésta, dentro de la misma lista.
 */
function alternaMarca(id, conRango, nodo) {
  if (conRango && ultimaMarcada && ultimaMarcada !== id) {
    const caja = nodo.closest(".vt-rows, .board-cards") || document;
    const lista = Array.from(caja.querySelectorAll("[data-sel]")).map(x => x.dataset.sel);
    const a = lista.indexOf(ultimaMarcada), b = lista.indexOf(id);
    if (a >= 0 && b >= 0) {
      const poner = !SELECCION.has(id);
      lista.slice(Math.min(a, b), Math.max(a, b) + 1)
        .forEach(x => poner ? SELECCION.add(x) : SELECCION.delete(x));
      ultimaMarcada = id;
      return renderGestion();
    }
  }
  SELECCION.has(id) ? SELECCION.delete(id) : SELECCION.add(id);
  ultimaMarcada = id;
  renderGestion();
}

function fechaMini(f) {
  if (!f) return "";
  const d = new Date(f + "T00:00:00");
  if (isNaN(d)) return "";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

/** Las que pasan el filtro de categoría y el buscador. */
function secuenciasFiltradas() {
  const cat = state.gestionCat || "all";
  const q = (state.gestionBusca || "").trim().toLowerCase();
  return (state.sequences || []).filter(s =>
    (cat === "all" || s.category === cat) &&
    (!q || (s.title || "").toLowerCase().includes(q)));
}

function filaGestion(seq) {
  const cat = CATEGORIES[seq.category] || CATEGORIES.venta;
  const est = estadoDe(seq);
  return `<div class="vt-row${SELECCION.has(String(seq.id)) ? " sel" : ""}" draggable="true" data-arrastra="${seq.id}">
    <div class="vt-title">${marca(seq.id)}<span class="vt-name"><a class="truncate" href="#" data-abrir="${seq.id}">${escapeHtml(seq.title || "Sin título")}</a></span></div>
    <div class="vt-area"><span class="pill cat-${seq.category}">${escapeHtml(cat.name)}</span></div>
    <div class="vt-stage"><span class="pill ${STATUS[est].cls}">${STATUS[est].label}</span></div>
    <div class="vt-datewrap${seq.scheduledDate ? "" : " vt-unset"}"><span class="vt-cell">${fechaMini(seq.scheduledDate) || "—"}</span></div>
    <div class="vt-pts"><span class="vt-cell nums">${seq.slides.length}</span></div>
  </div>`;
}

function tablaGestion(lista) {
  const plegados = state.gestionPlegados || [];
  return `<div class="vt">${ORDEN_ESTADOS.map(id => {
    const info = STATUS[id];
    const grupo = lista.filter(s => estadoDe(s) === id)
      .sort((a, b) => String(a.scheduledDate || "9999").localeCompare(String(b.scheduledDate || "9999")));
    const abierto = !plegados.includes(id);
    return `<div class="vt-group" data-soltar-estado="${id}">
      <button class="vt-group-head" aria-expanded="${abierto}" data-plegar="${id}">
        <span class="vt-caret${abierto ? " open" : ""}">›</span>
        <span class="pill ${info.cls}">${info.label}</span>
        <span class="tiny dim nums">${grupo.length || "—"}</span>
      </button>
      ${abierto ? `<div class="vt-rows">
        <div class="vt-row vt-head"><span class="vt-col">Secuencia</span><span class="vt-col">Categoría</span><span class="vt-col">Estado</span><span class="vt-col">Fecha</span><span class="vt-col vt-right">Frames</span></div>
        ${grupo.length ? grupo.map(filaGestion).join("") : '<div class="board-empty">Nada aquí</div>'}
      </div>` : ""}
    </div>`;
  }).join("")}</div>`;
}

function tableroGestion(lista) {
  return `<div class="board-frame"><div class="board"><div class="board-phase"><div class="board-phase-cols">
    ${ORDEN_ESTADOS.map(id => {
      const info = STATUS[id], grupo = lista.filter(s => estadoDe(s) === id);
      return `<div class="board-col" data-soltar-estado="${id}">
        <div class="board-head"><span class="board-dot ${info.cls}"></span><span class="board-label">${info.label}</span><span class="board-count nums">${grupo.length}</span></div>
        ${grupo.length ? `<div class="board-cards">${grupo.map(seq => {
          const cat = CATEGORIES[seq.category] || CATEGORIES.venta;
          return `<a class="vcard${SELECCION.has(String(seq.id)) ? " sel" : ""}" href="#" draggable="true" data-arrastra="${seq.id}" data-abrir="${seq.id}">
            ${marca(seq.id)}<span class="small strong">${escapeHtml(seq.title || "Sin título")}</span>
            <div class="row-between"><span class="pill cat-${seq.category}">${escapeHtml(cat.name)}</span><span class="tiny dim nums">${fechaMini(seq.scheduledDate) || seq.slides.length + " frames"}</span></div></a>`;
        }).join("")}</div>` : '<div class="board-empty">Nada aquí</div>'}
      </div>`;
    }).join("")}
  </div></div></div></div>`;
}

function renderGestion() {
  const cuerpo = $("#gestionCuerpo");
  if (!cuerpo) return;
  const todas = state.sequences || [];
  const lista = secuenciasFiltradas();

  // Filtro de categorías: sólo las que existen, para no enseñar botones vacíos.
  const usadas = ORDEN_CATEGORIAS.filter(k => todas.some(s => s.category === k));
  const cat = state.gestionCat || "all";
  $("#gestionCat").innerHTML = [["all", "Todas"], ...usadas.map(k => [k, CATEGORIES[k].name])]
    .map(([k, n]) => `<button class="${cat === k ? "active" : ""}" data-cat="${k}">${escapeHtml(n)} <span class="dim nums">${
      k === "all" ? todas.length : todas.filter(s => s.category === k).length}</span></button>`).join("");

  $("#gestionSub").textContent = todas.length
    ? `${todas.length} ${todas.length === 1 ? "secuencia" : "secuencias"} · marca varias para editarlas a la vez`
    : "Todavía no has guardado ninguna secuencia.";

  const vista = state.gestionVista || "list";
  $$("#gestionVista button").forEach(b => b.classList.toggle("active", b.dataset.vista === vista));

  /* Los tres estados salen siempre, aunque estén vacíos: así se ve el
     recorrido entero —borrador, programada, publicada— desde el primer día,
     y queda claro dónde va a ir cayendo cada cosa. */
  cuerpo.innerHTML = vista === "board" ? tableroGestion(lista) : tablaGestion(lista);

  pintaBarraSeleccion();
}

/** La barra de abajo, que sale sola cuando hay algo marcado. */
function pintaBarraSeleccion() {
  const n = seleccionadas().length;
  let b = document.getElementById("barraSel");
  if (!n) { if (b) b.remove(); document.body.classList.remove("con-barra-sel"); return; }
  if (!b) { b = document.createElement("div"); b.id = "barraSel"; b.className = "barra-sel"; document.body.appendChild(b); }
  document.body.classList.add("con-barra-sel");
  b.innerHTML = `
    <span class="bs-n"><b>${n}</b> ${n === 1 ? "seleccionada" : "seleccionadas"}</span>
    <button class="btn sm" data-bs="fecha">Fecha</button>
    <button class="btn sm" data-bs="categoria">Categoría</button>
    <button class="btn sm" data-bs="estado">Estado</button>
    <button class="btn sm" data-bs="titulo">Título</button>
    <button class="btn sm danger-text" data-bs="borrar">Borrar</button>
    <button class="btn sm ghost" data-bs="nada" title="Quitar la selección">Cancelar</button>`;
}

/* ---- Lo que se hace con lo marcado ------------------------------------ */

/* Guarda todas de una vez y repinta una sola. Antes de tocar nada se apunta
   lo que había, para poder dejarlo como estaba si algo falla. */
function guardaEnLote(seqs, cambia) {
  seqs.forEach(cambia);
  store.save(state.sequences);
  storeSched.save(state.schedule);
  if (state.user) seqs.forEach(s => { try { sbDB.sbUpsertSequence(s); } catch {} });
  renderAll();
  if (state.view === "calendar") renderCalendar();
}

function ponFechaEnLote(seqs) {
  pideDato({
    titulo: "Fecha para " + seqs.length + (seqs.length === 1 ? " secuencia" : " secuencias"),
    sub: "Se pone la misma a todas. Déjalo vacío para quitarles la fecha.",
    campos: [{ id: "f", tipo: "date", etiqueta: "Día", valor: seqs[0].scheduledDate || "" }],
    alAceptar: (v) => guardaEnLote(seqs, s => {
      setScheduleForSequence(s, v.f || null);
      s.scheduledDate = v.f || undefined;
      if (v.f && estadoDe(s) === "draft") s.status = "scheduled";
    })
  });
}

function ponCategoriaEnLote(seqs) {
  pideDato({
    titulo: "Categoría",
    sub: "La misma para las " + seqs.length + " seleccionadas.",
    campos: [{ id: "c", tipo: "select", etiqueta: "Categoría",
      opciones: ORDEN_CATEGORIAS.map(k => [k, CATEGORIES[k].name]), valor: seqs[0].category }],
    alAceptar: (v) => guardaEnLote(seqs, s => { s.category = v.c; })
  });
}

function ponEstadoEnLote(seqs) {
  pideDato({
    titulo: "Estado",
    sub: "El mismo para las " + seqs.length + " seleccionadas.",
    campos: [{ id: "e", tipo: "select", etiqueta: "Estado",
      opciones: ORDEN_ESTADOS.map(k => [k, STATUS[k].label]), valor: estadoDe(seqs[0]) }],
    alAceptar: (v) => guardaEnLote(seqs, s => { s.status = v.e; })
  });
}

function ponTituloEnLote(seqs) {
  pideDato({
    titulo: "Título",
    sub: "Se le pone el mismo a las " + seqs.length + " seleccionadas.",
    campos: [{ id: "t", tipo: "text", etiqueta: "Título", valor: seqs[0].title || "" }],
    alAceptar: (v) => { if (v.t.trim()) guardaEnLote(seqs, s => { s.title = v.t.trim(); }); }
  });
}

/*
 * Borra secuencias de verdad: de la lista, del calendario y de la nube.
 *
 * Es la ÚNICA forma de borrar, se haga desde Gestión o desde el calendario.
 * Antes el calendario sólo les quitaba la fecha: la secuencia seguía viva, y
 * marcada como «Programada», así que Gestión se llenaba de programadas sin
 * día que ya no estaban en ningún calendario.
 */
async function eliminaSecuencias(seqs) {
  if (!seqs.length) return;
  const ids = new Set(seqs.map(s => s.id));
  seqs.forEach(s => { s._borrada = true; removeScheduleEntriesForSeq(s.id); });
  state.sequences = state.sequences.filter(s => !ids.has(s.id));
  seqs.forEach(s => SELECCION.delete(String(s.id)));
  store.save(state.sequences);
  storeSched.save(state.schedule);
  renderAll();
  if (state.view === "calendar") renderCalendar();
  if (!state.user) return;
  // Una secuencia recién creada puede no tener aún su fila en la nube: se
  // espera a que termine de guardarse, o se borraría aquí y volvería al recargar.
  await Promise.all(seqs.map(s => s._guardando || null));
  const nube = seqs.map(s => s.cloudId).filter(Boolean);
  if (nube.length) { try { await sbDB.sbDeleteSequences(nube); } catch (e) { console.warn("borrar en la nube", e); } }
}

function borraEnLote(seqs) {
  pregunta({
    titulo: "Borrar " + seqs.length + (seqs.length === 1 ? " secuencia" : " secuencias"),
    sub: "No se puede deshacer. También se quitan del calendario.",
    ok: "Borrar", peligro: true,
    alAceptar: async () => {
      ultimaMarcada = null;
      await eliminaSecuencias(seqs);
      aviso(seqs.length + (seqs.length === 1 ? " secuencia borrada" : " secuencias borradas"));
    }
  });
}

/* ---- Diálogos, dentro de la web ---------------------------------------
 *
 * Nada de `prompt()` ni `confirm()` del navegador: salen fuera de la página,
 * con otra tipografía y otro idioma, y no se pueden cerrar con Escape.
 * ---------------------------------------------------------------------- */
function cierraDialogo() { document.getElementById("dlgLote")?.remove(); }

function montaDialogo(html, alMontar) {
  cierraDialogo();
  const d = document.createElement("div");
  d.id = "dlgLote";
  d.className = "modal";
  d.innerHTML = `<div class="modal-box small">${html}</div>`;
  document.body.appendChild(d);
  d.addEventListener("click", e => { if (e.target === d) cierraDialogo(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { cierraDialogo(); document.removeEventListener("keydown", esc); }
  });
  mejorarCampos(d);
  alMontar(d);
  return d;
}

function pideDato({ titulo, sub, campos, ok = "Aplicar", alAceptar }) {
  const cuerpo = campos.map(c => {
    if (c.tipo === "select") {
      return `<label class="field"><span>${escapeHtml(c.etiqueta)}</span>
        <select class="status-select" data-campo="${c.id}">${c.opciones.map(([k, n]) =>
          `<option value="${k}"${k === c.valor ? " selected" : ""}>${escapeHtml(n)}</option>`).join("")}</select></label>`;
    }
    return `<label class="field"><span>${escapeHtml(c.etiqueta)}</span>
      <input type="${c.tipo}" data-campo="${c.id}" value="${escapeAttr(String(c.valor || ""))}" /></label>`;
  }).join("");
  montaDialogo(`
    <div class="modal-head"><h2>${escapeHtml(titulo)}</h2></div>
    ${sub ? `<p class="modal-sub">${escapeHtml(sub)}</p>` : ""}
    ${cuerpo}
    <div class="save-row"><button class="btn" data-dlg="no">Cancelar</button><button class="btn primary" data-dlg="si">${escapeHtml(ok)}</button></div>`,
    (d) => {
      const leer = () => {
        const v = {};
        d.querySelectorAll("[data-campo]").forEach(x => { v[x.dataset.campo] = x.value; });
        return v;
      };
      d.querySelector('[data-dlg="no"]').addEventListener("click", cierraDialogo);
      d.querySelector('[data-dlg="si"]').addEventListener("click", () => { const v = leer(); cierraDialogo(); alAceptar(v); });
      d.querySelector("[data-campo]")?.focus();
    });
}

function pregunta({ titulo, sub, ok = "Aceptar", peligro = false, alAceptar }) {
  montaDialogo(`
    <div class="modal-head"><h2>${escapeHtml(titulo)}</h2></div>
    ${sub ? `<p class="modal-sub">${escapeHtml(sub)}</p>` : ""}
    <div class="save-row"><button class="btn" data-dlg="no">Cancelar</button>
      <button class="btn ${peligro ? "danger" : "primary"}" data-dlg="si">${escapeHtml(ok)}</button></div>`,
    (d) => {
      d.querySelector('[data-dlg="no"]').addEventListener("click", cierraDialogo);
      d.querySelector('[data-dlg="si"]').addEventListener("click", () => { cierraDialogo(); alAceptar(); });
      d.querySelector('[data-dlg="si"]').focus();
    });
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
function escapeAttr(s) { return escapeHtml(s); }

/* ---------------------------------------------------------------------- *
 *  CALENDARIO
 * ---------------------------------------------------------------------- */
const MONTHS_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DOW_ES = ["L","M","X","J","V","S","D"]; // empezamos en lunes
const DOW_LARGO = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
function fmtDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function ymKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }

// Orden en el que rotan las categorías en la base del calendario.

/*
 * Antes esto rellenaba cada mes con tres sugerencias por semana en cuanto lo
 * abrías. El problema no era la sugerencia, era que no se distinguía de lo
 * tuyo: abrías octubre y ya había doce cosas puestas que tú no habías
 * decidido. Ahora sólo prepara el hueco del mes, vacío, y el contenido lo
 * pides tú con «Generar propuesta».
 */
function ensureScheduleFor(monthDate) {
  const key = ymKey(monthDate);
  if (state.schedule[key]) return;
  state.schedule[key] = {};
  storeSched.save(state.schedule);
}

/* ======================================================================= *
 *  PROPUESTA DE CONTENIDO
 *
 *  El reparto no es una rotación ciega por las cinco categorías: cada una
 *  tiene su papel, y está escrito en su propia descripción del catálogo.
 *
 *    Valor    · «la base de tu semana», la que construye autoridad.
 *    Personal · a diario y entre secuencias de venta, para no cansar.
 *    Puente   · calienta y recoge contactos antes de pedir dinero.
 *    Flex     · pruebas y resultados, justo ANTES de una de venta.
 *    Venta    · poca frecuencia; pierde fuerza si se repite sin motivo.
 *
 *  (Reglas de Álvaro, 21/09/2026.) Cada semana lleva UNA de venta. El día de
 *  antes va una de Engagement o de Puente, alternándose por semanas: las dos
 *  hacen que la gente toque la story —votar, responder, pedir el recurso— y
 *  cuanta más interacción, a más gente enseña Instagram la siguiente, que es
 *  la de venta. El resto de días se reparte por cuotas entre Valor, Personal
 *  y Flex, sin repetir categoría dos días seguidos.
 * ======================================================================= */
const ROLES_SEMANA = {
  2: ["previa", "venta"],
  3: ["libre", "previa", "venta"],
  5: ["libre", "libre", "previa", "venta", "libre"],
};
const PESOS_LIBRES = { valor: 0.45, personal: 0.35, flex: 0.2 };
/* Qué días se publica (0 = domingo), en el orden de los papeles de arriba.
   Con 5, la venta cae en viernes y el domingo queda para algo ligero. */
const DIAS_RITMO = { 2: [3, 6], 3: [1, 3, 6], 5: [1, 2, 4, 5, 0] };
const NOMBRE_DIAS = {
  2: "miércoles (engagement o nutrición) y sábado (venta)",
  3: "lunes, miércoles (engagement o nutrición) y sábado (venta)",
  5: "lunes, martes, jueves (engagement o nutrición), viernes (venta) y domingo",
};

/** El lunes de la semana de una fecha. */
function lunesDe(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/*
 * Programa una plantilla del catálogo en un día: la convierte en una
 * secuencia de verdad, con sus fotos ya elegidas y guardadas.
 *
 * Antes el calendario guardaba sólo el nombre de la plantilla. Al abrirla se
 * hacía una copia nueva cada vez, con fotos al azar: la vista previa, el
 * editor y la miniatura enseñaban tres cosas distintas, y cambiaban al salir
 * y volver a entrar. Ahora es una secuencia como las tuyas: sale en Gestión
 * de stories, se sincroniza entre equipos y sus fotos no se mueven.
 */
function programaPlantilla(catId, dia) {
  const seq = fromCatalog(catId, { status: "scheduled" });
  seq.scheduledDate = dia;
  seq.style.scheduledDate = dia;
  state.sequences.unshift(seq);
  const ym = dia.slice(0, 7);
  state.schedule[ym] = state.schedule[ym] || {};
  calPush(state.schedule[ym], dia, tagDeSecuencia(seq));
  return seq;
}

/* La ventana: sólo dos preguntas, con botones dentro de la web (un
   desplegable del sistema se abre fuera, con otra letra y otro aspecto). */
function abrePropuesta() {
  let periodo = "mes", porSemana = 3;
  const pinta = (d) => {
    d.querySelectorAll("[data-per]").forEach(b => b.classList.toggle("active", b.dataset.per === periodo));
    d.querySelectorAll("[data-ps]").forEach(b => b.classList.toggle("active", Number(b.dataset.ps) === porSemana));
    d.querySelector("#propDias").textContent = "Se publica " + NOMBRE_DIAS[porSemana] + ".";
  };
  montaDialogo(`
    <div class="modal-head"><h2>Generar propuesta</h2></div>
    <p class="modal-sub">Cada semana lleva una de venta, con una de engagement o nutrición el día antes para que llegue a más gente. El resto, valor, personal y flex. Los días que ya tengan algo no se tocan.</p>
    <div class="campo-seg"><span>Para</span>
      <div class="segmented"><button data-per="semana">Esta semana</button><button data-per="mes">Todo el mes</button></div>
    </div>
    <div class="campo-seg"><span>Secuencias por semana</span>
      <div class="segmented"><button data-ps="2">2</button><button data-ps="3">3</button><button data-ps="5">5</button></div>
    </div>
    <p class="tiny dim" id="propDias"></p>
    <div class="save-row"><button class="btn" data-dlg="no">Cancelar</button><button class="btn primary" data-dlg="si">Generar</button></div>`,
    (d) => {
      pinta(d);
      d.addEventListener("click", e => {
        const per = e.target.closest("[data-per]"); if (per) { periodo = per.dataset.per; return pinta(d); }
        const ps = e.target.closest("[data-ps]");   if (ps)  { porSemana = Number(ps.dataset.ps); return pinta(d); }
      });
      d.querySelector('[data-dlg="no"]').addEventListener("click", cierraDialogo);
      d.querySelector('[data-dlg="si"]').addEventListener("click", () => { cierraDialogo(); generaPropuesta({ periodo, porSemana }); });
    });
}

function generaPropuesta({ periodo, porSemana }) {
  const mes = state.calMonth || new Date();
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const esteMes = mes.getFullYear() === hoy.getFullYear() && mes.getMonth() === hoy.getMonth();

  let desde, hasta;
  if (periodo === "semana") {
    // La semana de hoy si se está mirando este mes; si no, la primera del mes.
    desde = lunesDe(esteMes ? hoy : new Date(mes.getFullYear(), mes.getMonth(), 1));
    hasta = new Date(desde); hasta.setDate(hasta.getDate() + 6);
  } else {
    desde = new Date(mes.getFullYear(), mes.getMonth(), 1);
    hasta = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
  }
  // Nada en el pasado: una story programada para ayer no sirve de nada.
  if (desde < hoy) desde = new Date(hoy);

  // Las semanas del periodo, por su lunes: la previa se alterna por semana.
  const semanas = [];
  for (let l = lunesDe(desde); l <= hasta; l.setDate(l.getDate() + 7)) semanas.push(fmtDate(l));
  const roles = ROLES_SEMANA[porSemana], dias = DIAS_RITMO[porSemana];
  const cuenta = {};
  let total = 0;
  // La libre que más se ha quedado por debajo de su peso, sin repetir la anterior.
  const eligeLibre = (anterior) => {
    let mejor = null, falta = -Infinity;
    for (const [c, peso] of Object.entries(PESOS_LIBRES)) {
      if (c === anterior) continue;
      const f = peso * (total + 1) - (cuenta[c] || 0);
      if (f > falta + 1e-9) { mejor = c; falta = f; }
    }
    return mejor;
  };

  /* Las plantillas de cada categoría, barajadas una vez y gastadas en orden:
     no se repite ninguna hasta haber usado todas las de su categoría. */
  const bolsa = {};
  ORDEN_CATEGORIAS.forEach(k => { bolsa[k] = shuffle(CATALOG.filter(t => t.category === k).map(t => t.id)); });
  const coge = (cat) => { const b = bolsa[cat]; if (!b || !b.length) return null; const id = b.shift(); b.push(id); return id; };

  /* Primero se decide qué va en cada día, semana a semana; después se
     rellena en orden de fecha. Así se puede arreglar la semana que empieza
     antes del periodo: si su día de previa queda fuera (o ya ha pasado),
     la previa se pone el día justo antes de la venta, para que la venta no
     salga nunca sin su engagement o su puente delante. */
  const libre = d => d >= desde && d <= hasta;
  const ocupado = d => calList(state.schedule[fmtDate(d).slice(0, 7)] || {}, fmtDate(d)).length > 0;
  const huecos = [];
  let ocupados = 0;
  semanas.forEach((lunes, semana) => {
    const l = new Date(lunes + "T00:00:00");
    const deLaSemana = roles.map((papel, k) => {
      const d = new Date(l); d.setDate(l.getDate() + (dias[k] + 6) % 7);
      return { d, papel, semana };
    });
    const venta = deLaSemana.find(x => x.papel === "venta");
    const previa = deLaSemana.find(x => x.papel === "previa");
    if (venta && libre(venta.d) && previa && !libre(previa.d)) {
      const antes = new Date(venta.d); antes.setDate(antes.getDate() - 1);
      if (libre(antes)) previa.d = antes;
    }
    deLaSemana.forEach(x => {
      if (!libre(x.d)) return;
      if (ocupado(x.d)) { ocupados++; return; }
      huecos.push(x);
    });
  });
  huecos.sort((a, b) => a.d - b.d);

  const nuevas = [];
  let anterior = null;
  for (const { d, papel, semana } of huecos) {
    let cat;
    if (papel === "venta") cat = "venta";
    else if (papel === "previa") cat = semana % 2 === 0 ? "engagement" : "puente";
    else cat = eligeLibre(anterior);
    const id = coge(cat);
    if (!id) continue;
    nuevas.push(programaPlantilla(id, fmtDate(d)));
    anterior = cat;
    if (papel === "libre") { cuenta[cat] = (cuenta[cat] || 0) + 1; total++; }
  }

  storeSched.save(state.schedule);
  nuevas.forEach(guardarSecuencia);
  renderCalendar();
  if (state.view === "gestion") renderGestion();
  aviso(nuevas.length
    ? `${nuevas.length} ${nuevas.length === 1 ? "secuencia programada" : "secuencias programadas"}${
        ocupados ? ` · ${ocupados} ${ocupados === 1 ? "día ya tenía" : "días ya tenían"} algo` : ""}`
    : "No quedaba ningún día libre en ese periodo", nuevas.length ? "ok" : "error");
}

/* ---------------------------------------------------------------------- *
 *  EL CALENDARIO POR DENTRO
 *  Cada día guarda una lista: "<id del catálogo>" si es una propuesta, o
 *  "seq:<id>" si es una secuencia tuya.
 * ---------------------------------------------------------------------- */
function calList(map, key) {
  const v = map ? map[key] : null;
  if (v == null) return [];
  return Array.isArray(v) ? v.slice() : [v];
}
function calSet(map, key, list) {
  if (!list || !list.length) delete map[key];
  else map[key] = list;
}
// Días en los que aparece una secuencia del usuario, por todo el calendario
function diasDeSecuencia(seqId) {
  const seq = state.sequences.find(x => x.id === seqId);
  if (!seq) return [];
  const tags = ["seq:" + seq.id];
  if (seq.cloudId) tags.push("seq:" + seq.cloudId);
  const dias = [];
  for (const ym in state.schedule) {
    const map = state.schedule[ym];
    for (const d in map) {
      if (calList(map, d).some(e => tags.includes(e))) dias.push(d);
    }
  }
  return dias.sort();
}

// scheduledDate solo guarda una fecha, así que se apunta a la primera vez
// que aparece la secuencia. Si ya no está en ningún día, se vacía.
function sincronizarFechaSecuencia(seqId) {
  const seq = state.sequences.find(x => x.id === seqId);
  if (!seq) return;
  const dias = diasDeSecuencia(seqId);
  const fecha = dias.length ? dias[0] : undefined;
  seq.scheduledDate = fecha;
  if (seq.style) seq.style.scheduledDate = fecha;
  // Guarda ESTA secuencia. Antes guardaba la que estuviera abierta en el
  // editor, así que al arrastrar en el calendario la fecha nueva no llegaba
  // a la nube y al recargar reaparecía en el día viejo.
  guardarSecuencia(seq);
}

/* Guarda una secuencia concreta, esté abierta o no. */
function guardarSecuencia(seq) {
  store.save(state.sequences);
  if (!state.user || !seq) return;
  // Se guarda la petición en marcha: si se borra antes de que acabe, el
  // borrado la espera para saber qué fila de la nube quitar.
  seq._guardando = sbDB.sbUpsertSequence(seq).then(row => {
    if (row && !seq.cloudId) seq.cloudId = row.id;
    if (seq._borrada && seq.cloudId) sbDB.sbDeleteSequences([seq.cloudId]).catch(() => {});
  }).catch(() => {});
}

function calPush(map, key, entry) {
  const l = calList(map, key);
  l.push(entry);
  calSet(map, key, l);
}

/* El calendario apunta a las secuencias por su identificador de la nube,
 * que no cambia. El número local se reparte de nuevo en cada carga, así que
 * usarlo hacía que las entradas guardadas dejaran de coincidir y la misma
 * secuencia acabara duplicada en varios días. */
function tagDeSecuencia(seq) {
  return "seq:" + (seq.cloudId || seq.id);
}
function secuenciaDeTag(tag) {
  if (typeof tag !== "string" || !tag.startsWith("seq:")) return null;
  const ref = tag.slice(4);
  return state.sequences.find(s =>
    String(s.cloudId) === ref || String(s.id) === ref) || null;
}

// Devuelve { title, category, isUserSeq, ref } donde ref es la secuencia o el id de catálogo
function resolveCalEntry(entry) {
  if (typeof entry === "string" && entry.startsWith("seq:")) {
    const seq = secuenciaDeTag(entry);
    if (!seq) return null;
    return { title: seq.title, category: seq.category, isUserSeq: true, ref: seq.id };
  }
  const c = CATALOG.find(x => x.id === entry);
  if (!c) return null;
  return { title: c.title, category: c.category, isUserSeq: false, ref: c.id };
}

/* De dónde salen las stories y el estilo de una entrada del calendario: de la
   secuencia del usuario si es suya, y si no de la plantilla del catálogo. */
function slidesDeEntrada(r) {
  if (r.isUserSeq) {
    const sq = state.sequences.find(x => x.id === r.ref);
    return (sq && sq.slides) || [];
  }
  const c = CATALOG.find(x => x.id === r.ref);
  return (c && c.slides) || [];
}
function estiloDeEntrada(r) {
  if (r.isUserSeq) {
    const sq = state.sequences.find(x => x.id === r.ref);
    if (sq && sq.style) return sq.style;
  }
  return DEFAULT_STYLE;
}

// Quita todas las referencias 'seq:<id>' del schedule
function removeScheduleEntriesForSeq(seqId) {
  const seq = state.sequences.find(x => x.id === seqId);
  const tags = ["seq:" + seqId];
  if (seq && seq.cloudId) tags.push("seq:" + seq.cloudId);
  for (const ym in state.schedule) {
    const map = state.schedule[ym];
    for (const d in map) {
      calSet(map, d, calList(map, d).filter(e => !tags.includes(e)));
    }
  }
}

function setScheduleForSequence(seq, date) {
  removeScheduleEntriesForSeq(seq.id);
  seq.style.scheduledDate = date || undefined; // persiste en DB vía JSONB
  if (date) {
    const ym = date.slice(0, 7);
    state.schedule[ym] = state.schedule[ym] || {};
    calPush(state.schedule[ym], date, tagDeSecuencia(seq));
  }
  storeSched.save(state.schedule);
  if (state.view === "calendar") renderCalendar();
}

// Reconstruye entradas del calendario para secuencias con scheduledDate al iniciar
function rebuildScheduleFromSequences() {
  // 1. Fuera las entradas que apuntan a secuencias que ya no existen: son
  //    restos de los identificadores viejos y es lo que duplicaba días.
  for (const ym in state.schedule) {
    const map = state.schedule[ym];
    for (const d in map) {
      /* Sólo quedan las secuencias de verdad. Las entradas que eran el nombre
         de una plantilla suelta (de antes, o del relleno automático que había)
         se quitan: no tenían fotos guardadas y el calendario tiene que
         arrancar enseñando sólo lo que es tuyo. */
      const limpio = calList(map, d).filter(e =>
        typeof e === "string" && e.startsWith("seq:") && !!secuenciaDeTag(e));
      calSet(map, d, limpio);
    }
  }

  // 2. Cada secuencia con fecha aparece una sola vez, y con el tag estable
  state.sequences.forEach(s => {
    if (!s.scheduledDate) return;
    const dias = diasDeSecuencia(s.id);
    if (dias.length) return;              // ya está colocada
    const ym = s.scheduledDate.slice(0, 7);
    state.schedule[ym] = state.schedule[ym] || {};
    calPush(state.schedule[ym], s.scheduledDate, tagDeSecuencia(s));
  });

  storeSched.save(state.schedule);
}

/* Arrastre: guardamos día de origen e índice, porque un día puede tener
   varias secuencias y hay que mover exactamente la que se coge. */
let _dragFrom = null;

function renderCalendar() {
  if (!state.calMonth) state.calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  ensureScheduleFor(state.calMonth);
  const m = state.calMonth;
  $("#calLabel").textContent = `${MONTHS_ES[m.getMonth()]} ${m.getFullYear()}`;
  const map = state.schedule[ymKey(m)] || {};
  const grid = $("#calGrid"); grid.innerHTML = "";
  DOW_ES.forEach(d => {
    const h = document.createElement("div"); h.className = "cal-head"; h.textContent = d; grid.appendChild(h);
  });
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const pad = (first.getDay() + 6) % 7;
  for (let i = 0; i < pad; i++) {
    const c = document.createElement("div"); c.className = "cal-cell muted"; grid.appendChild(c);
  }
  const last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);

  for (let day = 1; day <= last; day++) {
    const date = new Date(m.getFullYear(), m.getMonth(), day);
    const key = fmtDate(date);
    const cell = document.createElement("div");
    cell.className = "cal-cell" + (date.getTime() === today.getTime() ? " today" : "");
    cell.dataset.key = key;

    const head = document.createElement("div");
    head.className = "cal-cell-head";
    const dn = document.createElement("span"); dn.className = "dnum"; dn.textContent = day;
    head.appendChild(dn);
    const add = document.createElement("button");
    add.className = "cal-add"; add.type = "button";
    add.title = "Añadir una secuencia a este día";
    add.textContent = "+";
    add.addEventListener("click", e => { e.stopPropagation(); openCalPicker(key); });
    head.appendChild(add);
    cell.appendChild(head);

    const list = calList(map, key);
    list.forEach((entry, idx) => {
      const r = resolveCalEntry(entry);
      if (!r) return;
      const cat = CATEGORIES[r.category] || CATEGORIES.venta;
      const seqEl = document.createElement("div");
      seqEl.className = "seq" + (r.isUserSeq ? " mine" : "");
      seqEl.setAttribute("draggable", "true");
      seqEl.innerHTML =
        `<span class="ct cat-${escapeAttr(r.category || "venta")}">${cat.name}</span>` +
        `<span class="sq-t">${escapeHtml(r.title)}</span>` +
        `<div class="sq-minis"></div>` +
        (r.isUserSeq ? `<button class="sq-otra" title="Otra de la misma categoría" aria-label="Otra de la misma categoría"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg></button>` : "") +
        `<button class="sq-x" title="Eliminar secuencia">✕</button>`;

      /* Las stories de la secuencia, en pequeño.
         Antes el día sólo decía el título, y para saber qué había ahí había
         que abrirlo. Con las miniaturas se ve el mes entero de un vistazo,
         que es justo para lo que sirve un calendario.
         Se dibujan al doble de tamaño y se encogen por CSS, si no en pantalla
         de retina salen borrosas. Sólo caben cuatro; el resto se cuenta. */
      const minis = seqEl.querySelector(".sq-minis");
      const diapos = slidesDeEntrada(r);
      const estilo = estiloDeEntrada(r);
      const dprM = Math.min(3, window.devicePixelRatio || 1);
      diapos.slice(0, 4).forEach(sl => {
        const cv = makeCardCanvas(sl, estilo, Math.round(26 * dprM), Math.round(46 * dprM));
        cv.className = "sq-mini";
        minis.appendChild(cv);
      });
      if (diapos.length > 4) {
        const mas = document.createElement("span");
        mas.className = "sq-mas";
        mas.textContent = "+" + (diapos.length - 4);
        minis.appendChild(mas);
      }

      seqEl.querySelector(".sq-otra")?.addEventListener("click", e => {
        e.stopPropagation();
        if (cambiaPorOtra(secuenciaDeTag(entry))) refrescaTrasCambio();
      });
      seqEl.querySelector(".sq-x").addEventListener("click", e => {
        e.stopPropagation();
        const sq = secuenciaDeTag(entry);
        if (sq) return borraEnLote([sq]);
        // Una entrada suelta sin secuencia detrás: sólo se quita del día.
        const cur = calList(map, key); cur.splice(idx, 1); calSet(map, key, cur);
        storeSched.save(state.schedule); renderCalendar();
      });

      // Al pulsar se ve de qué va la secuencia antes de abrir nada
      seqEl.addEventListener("click", () => openSeqPeek(entry, key, idx));

      seqEl.addEventListener("dragstart", e => {
        _dragFrom = { key, idx };
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", key + "#" + idx); } catch {}
        setTimeout(() => seqEl.classList.add("dragging"), 0);
      });
      seqEl.addEventListener("dragend", () => {
        _dragFrom = null;
        seqEl.classList.remove("dragging");
        $$(".cal-cell.drop-target").forEach(c => c.classList.remove("drop-target"));
      });
      cell.appendChild(seqEl);
    });

    // Toda la celda acepta soltar, tenga o no secuencias
    cell.addEventListener("dragenter", e => { if (_dragFrom) { e.preventDefault(); cell.classList.add("drop-target"); } });
    cell.addEventListener("dragover", e => {
      if (!_dragFrom) return;
      e.preventDefault(); e.dataTransfer.dropEffect = "move";
    });
    cell.addEventListener("dragleave", e => {
      if (!cell.contains(e.relatedTarget)) cell.classList.remove("drop-target");
    });
    cell.addEventListener("drop", e => {
      e.preventDefault();
      $$(".cal-cell.drop-target").forEach(c => c.classList.remove("drop-target"));
      const from = _dragFrom;
      _dragFrom = null;
      if (!from || from.key === key) return;
      const fromMap = state.schedule[from.key.slice(0,7)] || (state.schedule[from.key.slice(0,7)] = {});
      const toMap   = state.schedule[key.slice(0,7)]      || (state.schedule[key.slice(0,7)] = {});
      const origen = calList(fromMap, from.key);
      const movida = origen.splice(from.idx, 1)[0];
      if (movida == null) return;
      calSet(fromMap, from.key, origen);
      calPush(toMap, key, movida);
      // Si es una secuencia del usuario, se actualiza su fecha
      if (typeof movida === "string" && movida.startsWith("seq:")) {
        const sq = secuenciaDeTag(movida);
        if (sq) sincronizarFechaSecuencia(sq.id);
      }
      storeSched.save(state.schedule);
      renderCalendar();
    });

    grid.appendChild(cell);
  }
}

/* --------- Vista rápida: de qué va la secuencia de ese día -------------- */
let _peek = null;   // { entry, key, idx }

function openSeqPeek(entry, key, idx) {
  const r = resolveCalEntry(entry);
  if (!r) return;
  _peek = { entry, key, idx };

  const cat = CATEGORIES[r.category] || CATEGORIES.venta;
  $("#seqPeekTitle").textContent = r.title;
  const etiqueta = $("#seqPeekCat");
  etiqueta.textContent = cat.name;
  etiqueta.className = "peek-cat pill cat-" + (r.category || "venta");

  const [y, mo, d] = key.split("-");
  const fecha = new Date(+y, +mo - 1, +d);
  $("#seqPeekWhen").textContent =
    `${DOW_LARGO[(fecha.getDay() + 6) % 7]} ${fecha.getDate()} de ${MONTHS_ES[fecha.getMonth()]}`;

  // Se monta una copia solo para pintar; no entra en el estado de la app
  const seq = r.isUserSeq
    ? state.sequences.find(x => x.id === r.ref)
    : fromCatalog(r.ref, { id: -1 });

  _peekSeq = seq;
  _peekFrame = 0;
  $("#seqPeekOtra").classList.toggle("hidden", !r.isUserSeq);
  pintaVisor();
  $("#seqPeekModal").classList.remove("hidden");
}

/*
 * El visor de la vista previa: un frame grande y la tira debajo.
 *
 * Antes enseñaba todos los frames en fila a 150 px de ancho. El texto de una
 * story se dibuja a escala del ancho, así que lo que en la story mide 44 px
 * se quedaba en unos 6: no se leía, y encima salía borroso porque se pintaba
 * a 1x en pantallas que son 2x. Ahora el frame grande ocupa lo que cabe en
 * la ventana y se pinta a la resolución real de la pantalla.
 */
let _peekSeq = null, _peekFrame = 0;
function pintaVisor() {
  const cont = $("#seqPeekFrames");
  const seq = _peekSeq;
  if (!seq || !seq.slides.length) {
    cont.innerHTML = `<p class="empty">Esta secuencia todavía no tiene frames.</p>`;
    return;
  }
  const n = seq.slides.length;
  _peekFrame = Math.max(0, Math.min(n - 1, _peekFrame));
  const alto = Math.round(Math.min(window.innerHeight * 0.62, 600));
  const ancho = Math.round(alto * 9 / 16);
  const dpr = Math.min(3, window.devicePixelRatio || 1);

  cont.innerHTML = `
    <div class="peek-visor">
      <button class="peek-flecha" data-pk="-1" aria-label="Frame anterior" ${_peekFrame === 0 ? "disabled" : ""}>‹</button>
      <div class="peek-grande" style="width:${ancho}px;height:${alto}px">
        <div class="peek-barras">${seq.slides.map((_, i) => `<i class="${i < _peekFrame ? "vista" : i === _peekFrame ? "actual" : ""}"></i>`).join("")}</div>
        <button class="peek-toque izq" data-pk="-1" aria-label="Anterior"></button>
        <button class="peek-toque der" data-pk="1" aria-label="Siguiente"></button>
      </div>
      <button class="peek-flecha" data-pk="1" aria-label="Frame siguiente" ${_peekFrame === n - 1 ? "disabled" : ""}>›</button>
    </div>
    <div class="peek-pie"><span class="tiny dim">Frame ${_peekFrame + 1} de ${n}</span></div>
    <div class="peek-tira"></div>`;

  const cv = document.createElement("canvas");
  cv.width = Math.round(ancho * dpr); cv.height = Math.round(alto * dpr);
  cv.style.width = ancho + "px"; cv.style.height = alto + "px";
  drawSlide(cv.getContext("2d"), seq.slides[_peekFrame], cv.width, cv.height, seq.style);
  cont.querySelector(".peek-grande").prepend(cv);

  const tira = cont.querySelector(".peek-tira");
  seq.slides.forEach((sl, i) => {
    const b = document.createElement("button");
    b.className = "peek-mini" + (i === _peekFrame ? " activo" : "");
    b.setAttribute("aria-label", "Frame " + (i + 1));
    b.dataset.pkIr = i;
    const m = document.createElement("canvas");
    m.width = Math.round(46 * dpr); m.height = Math.round(82 * dpr);
    drawSlide(m.getContext("2d"), sl, m.width, m.height, seq.style);
    b.appendChild(m);
    tira.appendChild(b);
  });
}
function muevePeek(delta) { _peekFrame += delta; pintaVisor(); }

function closeSeqPeek() {
  $("#seqPeekModal").classList.add("hidden");
  $("#seqPeekRemove").classList.remove("hidden");
  $("#seqPeekOpen").textContent = "Abrir en el editor";
  _peek = null;
}

// Abre de verdad: si es del catálogo, primero se hace tuya
function peekOpenInEditor() {
  if (!_peek) return;
  if (_peek.lib) { const id = _peek.lib, vista = _peekSeq; closeSeqPeek(); return usarPlantilla(id, vista); }
  const { entry, key, idx } = _peek;
  const r = resolveCalEntry(entry);
  closeSeqPeek();
  if (!r) return;
  if (r.isUserSeq) { openEditor(r.ref); return; }
  const created = fromCatalog(r.ref, { status: "scheduled" });
  created.scheduledDate = key;
  if (created.style) created.style.scheduledDate = key;
  state.sequences.unshift(created);
  const map = state.schedule[key.slice(0, 7)] || (state.schedule[key.slice(0, 7)] = {});
  const cur = calList(map, key);
  cur[idx] = tagDeSecuencia(created);
  calSet(map, key, cur);
  storeSched.save(state.schedule);
  persist();
  openEditor(created.id);
}

function peekRemoveFromDay() {
  if (!_peek) return;
  const { entry, key, idx } = _peek;
  const sq = secuenciaDeTag(entry);
  if (sq) { closeSeqPeek(); return borraEnLote([sq]); }
  const map = state.schedule[key.slice(0, 7)];
  if (map) {
    const cur = calList(map, key);
    cur.splice(idx, 1);
    calSet(map, key, cur);
    if (typeof entry === "string" && entry.startsWith("seq:")) {
      { const sq = secuenciaDeTag(entry); if (sq) sincronizarFechaSecuencia(sq.id); }
    }
    storeSched.save(state.schedule);
  }
  closeSeqPeek();
  renderCalendar();
}

/* ------------------ Elegir qué secuencia va en un día ------------------- */
let _calPickKey = null;

function openCalPicker(key) {
  _calPickKey = key;
  const [y, mo, d] = key.split("-");
  const fecha = new Date(+y, +mo - 1, +d);
  $("#calPickDate").textContent =
    `${fecha.getDate()} de ${MONTHS_ES[fecha.getMonth()]}`;
  $("#calPickSearch").value = "";
  renderCalPickList();
  $("#calPickModal").classList.remove("hidden");
  setTimeout(() => $("#calPickSearch").focus(), 40);
}

function closeCalPicker() {
  $("#calPickModal").classList.add("hidden");
  _calPickKey = null;
}

function renderCalPickList() {
  const q = ($("#calPickSearch").value || "").trim().toLowerCase();
  const cont = $("#calPickList");
  const mias = state.sequences.map(s => ({
    entry: tagDeSecuencia(s), title: s.title, category: s.category, mine: true
  }));
  const cat = CATALOG.map(c => ({
    entry: c.id, title: c.title, category: c.category, mine: false
  }));
  const todo = mias.concat(cat).filter(x => !q || x.title.toLowerCase().includes(q));

  if (!todo.length) {
    cont.innerHTML = `<p class="empty">No hay ninguna secuencia con ese nombre.</p>`;
    return;
  }
  cont.innerHTML = "";
  todo.slice(0, 60).forEach(x => {
    const c = CATEGORIES[x.category] || CATEGORIES.venta;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "cal-pick-row";
    row.innerHTML =
      `<span class="cp-t">${escapeHtml(x.title)}</span>` +
      `<span class="cp-c">${c.name}${x.mine ? " · tuya" : ""}</span>`;
    row.addEventListener("click", () => {
      const ym = _calPickKey.slice(0, 7);
      state.schedule[ym] = state.schedule[ym] || {};
      if (x.mine) {
        calPush(state.schedule[ym], _calPickKey, x.entry);
        const sq = secuenciaDeTag(x.entry); if (sq) sincronizarFechaSecuencia(sq.id);
      } else {
        // Una plantilla del catálogo se convierte en secuencia tuya al ponerla en un día.
        guardarSecuencia(programaPlantilla(x.entry, _calPickKey));
      }
      storeSched.save(state.schedule);
      closeCalPicker();
      renderCalendar();
    });
    cont.appendChild(row);
  });
}

function calMove(delta) {
  if (!state.calMonth) state.calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + delta, 1);
  renderCalendar();
}


/* =========================================================================
 *  EDITOR
 * ========================================================================= */
function openEditor(id) {
  state.active = state.sequences.find(s => s.id === id);
  state.current = 0;
  $("#editorTitle").value = state.active.title;
  $("#statusSelect").value = state.active.status;
  $("#catSelect").value = state.active.category;
  syncSchedDate();
  syncStyleControls();
  refrescaCampos($("#overlay"));
  $("#overlay").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  renderThumbs(); drawEditor();
}

function syncSchedDate() {
  const inp = $("#schedDate");
  if (!inp) return;
  const isSched = state.active?.status === "scheduled";
  inp.classList.toggle("hidden", !isSched);
  if (isSched) inp.value = state.active.scheduledDate || "";
}
function closeEditor() {
  persist();
  $("#overlay").classList.add("hidden");
  document.body.style.overflow = "";
  state.active = null; renderAll();
}
function syncStyleControls() {
  const st = state.active.style;
  $("#highlightColor").value = acentoDe(st);
  $("#textColor").value = st.textColor;
  $("#sizeRange").value = String(st.size);
  updateColorDots();
  syncFontChips();
}
function updateColorDots() {
  const st = state.active?.style; if (!st) return;
  const t = $("#textColorDot"); if (t) t.style.background = st.textColor;
  const h = $("#highlightColorDot");
  if (h) { h.style.background = st.highlightColor || ""; h.classList.toggle("sin-color", !st.highlightColor); }
  $("#bodyRico")?.style.setProperty("--m-hl", acentoDe(st));
}
function syncFontChips() {
  const btn = $("#fuenteCampo"); if (!btn || !state.active) return;
  const f = fuenteDe(state.active.style.font) || FONTS[0];
  btn.innerHTML = `<span style="font-family:${escapeAttr(muestraDe(f))};font-weight:${f.w}">${escapeHtml(f.name)}</span>` + SVG_CHEV;
}
function syncOverlayChips() {
  const cur = curSlide().overlay;
  $$(".chip-vis").forEach(c => c.classList.toggle("active", c.dataset.overlay === cur));
}
function curSlide() { return state.active.slides[state.current]; }
function renderThumbs() {
  const box = $("#thumbs"); box.innerHTML = "";
  state.active.slides.forEach((slide, i) => {
    const t = document.createElement("button");
    t.className = "thumb" + (i === state.current ? " active" : "");
    const cv = document.createElement("canvas");
    cv.width = 216; cv.height = 384;  // a 2x del tamaño en pantalla, para que se lea
    drawSlide(cv.getContext("2d"), slide, cv.width, cv.height, state.active.style);
    t.appendChild(cv);
    const span = document.createElement("span"); span.textContent = "Frame " + (i + 1);
    t.appendChild(span);
    t.addEventListener("click", () => { state.current = i; renderThumbs(); drawEditor(); });
    box.appendChild(t);
  });
  const add = document.createElement("button");
  add.className = "thumb add"; add.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg><span>Añadir frame</span>`;
  add.addEventListener("click", () => {
    state.active.slides.push(makeSlide({ body: blankBody(0), overlay: "bottom" }));
    assignRandomImages(state.active);
    state.current = state.active.slides.length - 1;
    persist(); renderThumbs(); drawEditor();
  });
  box.appendChild(add);
}
function refreshActiveThumb() {
  const cv = $("#thumbs").children[state.current]?.querySelector("canvas");
  if (cv) drawSlide(cv.getContext("2d"), curSlide(), cv.width, cv.height, state.active.style);
}
function renderEditPanel() {
  const slide = curSlide();
  $("#slideName").textContent = "Frame " + (state.current + 1) + " / " + state.active.slides.length;
  $("#bodyInput").value = slide.body;
  // drawEditor pasa por aquí en cada cambio: sólo se repinta el texto si es
  // otro (otro frame, deshacer…), o el cursor saltaría mientras escribes.
  const rico = $("#bodyRico");
  if (rico._slide !== slide || charsAMarcas(leeRico(rico)) !== (slide.body || "")) {
    if (rico._slide !== slide) _ultimaSel = null;
    rico._slide = slide;
    pintaRico(rico, marcasAChars(slide.body));
    pintaBotonesMarca();
  }
  $("#alignChips")?.querySelectorAll("[data-align]").forEach(b => b.classList.toggle("on", b.dataset.align === (slide.align || "left")));
  $("#bodyRico").style.textTransform = slide.caso === "upper" ? "uppercase" : slide.caso === "lower" ? "lowercase" : "";
  document.querySelectorAll("[data-caso]").forEach(b => b.classList.toggle("on", b.dataset.caso === (slide.caso || "")));
  syncOverlayChips();
  $("#bgZoom").value = slide.bg.zoom;
  $("#insetControls").classList.toggle("hidden", !slide.inset);
  pintaCamposSticker(slide);
  renderBgPicker();
}

/* Los campos del sticker: sólo los que tocan según el tipo. No se reescriben
   mientras se está escribiendo en ellos, o el cursor saltaría al final. */
function pintaCamposSticker(slide) {
  const st = slide.sticker, caja = $("#stickerEdit");
  if (!caja) return;
  caja.classList.toggle("hidden", !st);
  if (!st) return;
  $("#stkEtiqueta").textContent = st.tipo === "preguntas" ? "Texto de la caja" : "Pregunta";
  $("#stkOpciones").classList.toggle("hidden", st.tipo !== "encuesta");
  $("#stkEmojiCampo").classList.toggle("hidden", st.tipo !== "slider");
  const pon = (id, v) => { const el = $(id); if (document.activeElement !== el) el.value = v; };
  pon("#stkTexto", st.texto || "");
  pon("#stkOp1", (st.opciones || [])[0] || "");
  pon("#stkOp2", (st.opciones || [])[1] || "");
  pon("#stkEmoji", st.emoji || "");
  pon("#stkY", st.y == null ? 0.6 : st.y);
}
/*
 * Elegir la foto del frame. Antes estaban todas en fila debajo de la vista
 * previa y la lista no acababa nunca; ahora hay un botón por tipo (Owner y
 * Background) y cada uno abre su ventana con las fotos de ese tipo.
 * Esto se llama en cada repintado del editor, así que sólo toca los números.
 */
function renderBgPicker() {
  const box = $("#bgPicker"); if (!box) return;
  const vacio = !state.images.length;
  box.innerHTML = vacio ? `<span class="bg-empty">Sube fotos en "Galería" para elegir el fondo.</span>` : "";
  document.querySelectorAll("[data-elige-tipo]").forEach(b => b.classList.toggle("hidden", vacio));
}
function abreFotosTipo(tipo) {
  if (!state.active) return;
  const lista = state.images.map((im, i) => ({ im, i })).filter(x => x.im.tipo === tipo);
  const nombre = TIPOS_FOTO[tipo]?.nombre || tipo;
  const actual = curSlide().bgIndex;
  montaDialogo(`
    <div class="modal-head fotos-pop-head"><p class="fotos-pop-titulo">${lista.length ? `Elige la foto de fondo del frame ${state.current + 1}` : `No tienes fotos marcadas como ${nombre}. Márcalas en Galería.`}</p><button class="icon-btn" data-dlg="no" aria-label="Cerrar">✕</button></div>
    <div class="fotos-pop-rejilla">${lista.map(({ i }) =>
      `<button type="button" class="fotos-pop-foto${i === actual ? " activa" : ""}" data-foto="${i}"><img alt="" loading="lazy"></button>`).join("")}</div>`,
    d => {
      d.querySelector(".modal-box").classList.remove("small");
      d.querySelector(".modal-box").classList.add("fotos-pop");
      d.querySelector('[data-dlg="no"]').addEventListener("click", cierraDialogo);
      d.querySelectorAll("[data-foto]").forEach(b => {
        const im = state.images[+b.dataset.foto], img = b.querySelector("img");
        const u = miniDe(im, url => { img.src = url; });
        if (u) img.src = u;
        b.addEventListener("click", () => {
          ponFondo(curSlide(), +b.dataset.foto);
          curSlide().bg = { zoom: 1, ox: 0, oy: 0 };
          cierraDialogo();
          drawEditor(); refreshActiveThumb(); persist();
        });
      });
    });
}
// RAF debouncer: múltiples drawEditor() en el mismo frame → un único render
let _drawScheduled = false;
function drawEditor() {
  if (_drawScheduled) return;
  _drawScheduled = true;
  requestAnimationFrame(() => {
    _drawScheduled = false;
    if (!state.active) return;
    drawSlide(ctx(), curSlide(), CANVAS_W, CANVAS_H, state.active.style, true);
    renderEditPanel();
  });
}

/* =========================================================================
 *  RENDER (igual que antes)
 * ========================================================================= */
const SAFE = { top: 0.075, bottom: 0.82, left: 0.05, right: 0.95 };
function clampSafe(v, min, max) { return min > max ? (min + max) / 2 : Math.max(min, Math.min(max, v)); }
function drawSlide(c, slide, w, h, style, guides) {
  aseguraFuente(style);
  const scale = w / CANVAS_W;
  c.clearRect(0, 0, w, h);
  const imgObj = slide.bgIndex >= 0 ? state.images[slide.bgIndex] : null;
  if (imgObj) drawCover(c, imgObj.img, w, h, slide.bg); else drawPlaceholder(c, w, h);
  drawOverlay(c, slide.overlay, w, h);
  if (slide.inset && slide.inset.img) drawInset(c, slide.inset, w, h);
  drawBody(c, slide, style, scale, w, h);
  if (slide.sticker) drawSticker(c, slide.sticker, w, h);
  if (guides) drawGuides(c, w, h);
}

/* =========================================================================
 *  STICKERS DE INSTAGRAM, SIMULADOS
 *
 *  Caja de preguntas, encuesta y slider de emoji, con el aspecto de los
 *  nativos: tarjeta blanca de esquinas redondeadas y la letra del sistema.
 *  No son interactivos —esto es un boceto de la story—: sirven para que se
 *  entienda de un vistazo qué pide ese frame, y al publicar se pone encima
 *  el sticker de verdad. Todo se mide en proporción al ancho, así sale igual
 *  en la miniatura del calendario que en el editor.
 * ========================================================================= */
const FUENTE_STICKER = '-apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
const limpiaMarcas = t => String(t || "").replace(/==|__|\*\*/g, "");

function lineasQueCaben(c, texto, maxW) {
  const palabras = limpiaMarcas(texto).split(/\s+/).filter(Boolean);
  const lineas = []; let l = "";
  palabras.forEach(p => {
    const prueba = l ? l + " " + p : p;
    if (c.measureText(prueba).width > maxW && l) { lineas.push(l); l = p; } else l = prueba;
  });
  if (l) lineas.push(l);
  return lineas;
}

function drawSticker(c, st, w, h) {
  const u = w / 1080;                               // 1 = un píxel de una story real
  const cx = w / 2, cy = (st.y == null ? 0.6 : st.y) * h;
  const W = (st.tipo === "encuesta" ? 700 : 660) * u, pad = 34 * u;
  c.save();
  c.textAlign = "center"; c.textBaseline = "middle";

  // Lo que ocupa cada parte, para saber el alto de la tarjeta antes de pintar.
  const tamT = 40 * u, lhT = tamT * 1.22;
  c.font = `700 ${tamT}px ${FUENTE_STICKER}`;
  const lineas = lineasQueCaben(c, st.texto || "", W - pad * 2);
  const altoTexto = lineas.length * lhT;
  let altoCuerpo = 0;
  const opciones = (st.opciones && st.opciones.length ? st.opciones : ["Sí", "No"]).slice(0, 4);
  if (st.tipo === "preguntas") altoCuerpo = 84 * u;
  else if (st.tipo === "encuesta") altoCuerpo = opciones.length * 86 * u + (opciones.length - 1) * 14 * u;
  else altoCuerpo = 96 * u;                          // slider
  const arriba = st.tipo === "preguntas" ? 62 * u : pad;
  const H = arriba + altoTexto + 26 * u + altoCuerpo + pad;
  const x = cx - W / 2, y = cy - H / 2;

  // La tarjeta, con una sombra suave como la de Instagram.
  c.shadowColor = "rgba(0,0,0,.28)"; c.shadowBlur = 30 * u; c.shadowOffsetY = 8 * u;
  c.fillStyle = "#fff"; roundRect(c, x, y, W, H, 30 * u); c.fill();
  c.shadowColor = "transparent";

  // La caja de preguntas lleva la foto de perfil asomando por arriba.
  if (st.tipo === "preguntas") {
    const r = 46 * u;
    const g = c.createLinearGradient(cx - r, y - r, cx + r, y + r);
    g.addColorStop(0, "#feda75"); g.addColorStop(.5, "#d62976"); g.addColorStop(1, "#4f5bd5");
    c.fillStyle = g; c.beginPath(); c.arc(cx, y, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#fff"; c.beginPath(); c.arc(cx, y, r - 6 * u, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#c7c7cc"; c.beginPath(); c.arc(cx, y, r - 12 * u, 0, Math.PI * 2); c.fill();
  }

  c.fillStyle = "#111";
  c.font = `700 ${tamT}px ${FUENTE_STICKER}`;
  lineas.forEach((l, i) => c.fillText(l, cx, y + arriba + lhT * (i + .5)));
  const y0 = y + arriba + altoTexto + 26 * u;

  if (st.tipo === "preguntas") {
    c.fillStyle = "#efeff4"; roundRect(c, x + pad, y0, W - pad * 2, 84 * u, 20 * u); c.fill();
    c.fillStyle = "#8e8e93"; c.font = `500 ${32 * u}px ${FUENTE_STICKER}`;
    c.fillText("Escribe algo…", cx, y0 + 42 * u);
  } else if (st.tipo === "encuesta") {
    c.font = `600 ${34 * u}px ${FUENTE_STICKER}`;
    opciones.forEach((o, i) => {
      const oy = y0 + i * (86 + 14) * u;
      c.fillStyle = "#efeff4"; roundRect(c, x + pad, oy, W - pad * 2, 86 * u, 22 * u); c.fill();
      c.fillStyle = "#111";
      const t = lineasQueCaben(c, o, W - pad * 4)[0] || "";
      c.fillText(t, cx, oy + 43 * u);
    });
  } else {
    // Slider: la barra con el degradado de Instagram y el emoji encima.
    const bx = x + pad + 10 * u, bw = W - pad * 2 - 20 * u, by = y0 + 58 * u;
    c.fillStyle = "#e5e5ea"; roundRect(c, bx, by - 7 * u, bw, 14 * u, 7 * u); c.fill();
    const g = c.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, "#feda75"); g.addColorStop(.5, "#fa7e1e"); g.addColorStop(1, "#d62976");
    const hasta = bw * 0.68;
    c.fillStyle = g; roundRect(c, bx, by - 7 * u, hasta, 14 * u, 7 * u); c.fill();
    c.font = `${78 * u}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    c.fillText(st.emoji || "😍", bx + hasta, by - 4 * u);
  }
  c.restore();
}
function drawGuides(c, w, h) {
  const ty = SAFE.top * h, by = SAFE.bottom * h;
  c.save();
  c.fillStyle = "rgba(0,0,0,0.22)";
  c.fillRect(0, 0, w, ty); c.fillRect(0, by, w, h - by);
  c.strokeStyle = "rgba(255,255,255,0.45)";
  c.lineWidth = Math.max(1, w * 0.003);
  c.setLineDash([w * 0.022, w * 0.022]);
  c.beginPath(); c.moveTo(0, ty); c.lineTo(w, ty); c.moveTo(0, by); c.lineTo(w, by); c.stroke();
  c.setLineDash([]);
  c.restore();
}
function drawCover(c, img, w, h, bg) {
  bg = bg || { zoom: 1, ox: 0, oy: 0 };
  const ir = img.width / img.height, tr = w / h;
  let dw, dh;
  if (ir > tr) { dh = h; dw = h * ir; } else { dw = w; dh = w / ir; }
  dw *= bg.zoom; dh *= bg.zoom;
  let dx = (w - dw) / 2 + bg.ox * w;
  let dy = (h - dh) / 2 + bg.oy * h;
  dx = Math.min(0, Math.max(w - dw, dx));
  dy = Math.min(0, Math.max(h - dh, dy));
  c.drawImage(img, dx, dy, dw, dh);
}
function drawPlaceholder(c, w, h) {
  c.fillStyle = "#1b1b1e";
  c.fillRect(0, 0, w, h);
  c.fillStyle = "rgba(255,255,255,0.16)";
  c.textAlign = "center"; c.textBaseline = "middle";
  c.font = `500 ${w * 0.05}px -apple-system, system-ui, sans-serif`;
  c.fillText("＋ foto", w / 2, h / 2);
}
function drawOverlay(c, type, w, h) {
  if (type === "none") return;
  let g;
  if (type === "bottom") { g = c.createLinearGradient(0, h * 0.4, 0, h); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.78)"); }
  else if (type === "soft") { c.fillStyle = "rgba(0,0,0,0.28)"; c.fillRect(0, 0, w, h); return; }
  else { g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "rgba(0,0,0,0.45)"); g.addColorStop(0.5, "rgba(0,0,0,0.30)"); g.addColorStop(1, "rgba(0,0,0,0.62)"); }
  c.fillStyle = g; c.fillRect(0, 0, w, h);
}
function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function drawInset(c, inset, w, h) {
  const iw = inset.scale * w;
  const ih = iw * (inset.img.height / inset.img.width);
  const x = inset.cx * w - iw / 2, y = inset.cy * h - ih / 2;
  const r = iw * 0.04;
  c.save();
  c.shadowColor = "rgba(0,0,0,0.5)"; c.shadowBlur = iw * 0.06; c.shadowOffsetY = iw * 0.02;
  roundRect(c, x, y, iw, ih, r); c.fillStyle = "#000"; c.fill();
  c.restore();
  c.save();
  roundRect(c, x, y, iw, ih, r); c.clip();
  c.drawImage(inset.img, x, y, iw, ih);
  c.restore();
}
function tokenizeLine(line) {
  const segs = []; let hl = false, ul = false, ac = false, buf = "";
  const flush = () => { if (buf) { segs.push({ text: buf, hl, ul, ac }); buf = ""; } };
  for (let i = 0; i < line.length;) {
    const two = line.substr(i, 2);
    if (two === "==") { flush(); hl = !hl; i += 2; continue; }
    if (two === "__") { flush(); ul = !ul; i += 2; continue; }
    if (two === "**") { flush(); ac = !ac; i += 2; continue; }
    buf += line[i++];
  }
  flush();
  return segs;
}
function segsToWords(segs) {
  const words = [];
  segs.forEach(s => s.text.split(/\s+/).forEach(p => {
    if (p === "") return;
    words.push({ text: p, hl: s.hl, ul: s.ul, ac: s.ac });
  }));
  return words;
}
const TXT = { left: 0.05, right: 0.95 };
// Mayúsculas / minúsculas: se aplica al dibujar; el texto guardado no cambia
const conCaso = (t, caso) => caso === "upper" ? t.toLocaleUpperCase("es") : caso === "lower" ? t.toLocaleLowerCase("es") : t;
function layoutBody(c, slide, style, scale, w, h) {
  const text = conCaso((slide.body || "").trim(), slide.caso);
  if (!text) return null;
  const size = 46 * style.size * scale;
  const lh = size * 1.34;
  const parGap = size * 0.6;
  c.font = `${style.weight} ${size}px ${style.font}`;
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  const lx = slide.pos.x;
  const left = lx * w;
  const maxW = Math.max(size * 2.5, (TXT.right - lx) * w);
  const sp = c.measureText(" ").width;
  const layout = []; let blockW = 0;
  text.split("\n").forEach(par => {
    if (par.trim() === "") { layout.push({ gap: true }); return; }
    const fitted = [];
    segsToWords(tokenizeLine(par)).forEach(t => {
      const wd = c.measureText(t.text).width;
      if (wd <= maxW) { t.w = wd; fitted.push(t); return; }
      let chunk = "";
      for (const ch of t.text) {
        if (chunk && c.measureText(chunk + ch).width > maxW) {
          fitted.push({ text: chunk, hl: t.hl, ul: t.ul, ac: t.ac, w: c.measureText(chunk).width });
          chunk = ch;
        } else chunk += ch;
      }
      if (chunk) fitted.push({ text: chunk, hl: t.hl, ul: t.ul, ac: t.ac, w: c.measureText(chunk).width });
    });
    const lines = []; let line = [], lineW = 0;
    fitted.forEach(t => {
      const gap = line.length ? sp : 0;
      if (lineW + gap + t.w > maxW && line.length) {
        lines.push({ words: line, width: lineW }); line = []; lineW = 0;
        t.x = 0; line.push(t); lineW = t.w;
      } else { t.x = lineW + gap; line.push(t); lineW += gap + t.w; }
    });
    if (line.length) lines.push({ words: line, width: lineW });
    // Alineación: a la izquierda, centrado, a la derecha o justificado
    // (la última línea de cada párrafo se queda a la izquierda, como en
    // cualquier texto justificado).
    const al = slide.align || "left";
    lines.forEach((l, k) => {
      if (al === "justify") {
        if (k < lines.length - 1 && l.words.length > 1) {
          const extra = (maxW - l.width) / (l.words.length - 1);
          l.words.forEach((t, n) => { t.x += extra * n; });
          l.width = maxW;
        }
      } else if (al === "center" || al === "right") {
        const ox = al === "center" ? (maxW - l.width) / 2 : maxW - l.width;
        l.words.forEach(t => { t.x += ox; });
      }
    });
    lines.forEach(l => { blockW = Math.max(blockW, l.width); });
    if (al !== "left") blockW = maxW;
    layout.push({ lines });
  });
  let total = 0;
  layout.forEach(b => { total += b.gap ? parGap : b.lines.length * lh; });
  return { layout, blockW, total, size, lh, parGap, left, topY: slide.pos.y * h };
}
function drawBody(c, slide, style, scale, w, h) {
  slide._textBox = null;
  const L = layoutBody(c, slide, style, scale, w, h);
  if (!L) return;
  const { layout, blockW, total, size, lh, parGap, left, topY } = L;
  const pad = size * 0.3;
  slide._textBox = { x: (left - pad) / scale, y: (topY - pad) / scale, w: (blockW + pad * 2) / scale, h: (total + pad * 2) / scale };
  let y = topY + size;
  const mt = c.measureText("H"), mg = c.measureText("g");
  layout.forEach(block => {
    if (block.gap) { y += parGap; return; }
    block.lines.forEach(ln => {
      for (let i = 0; i < ln.words.length;) {
        if (ln.words[i].hl) {
          let j = i, sX = ln.words[i].x, eX = ln.words[i].x + ln.words[i].w;
          while (j < ln.words.length && ln.words[j].hl) { eX = ln.words[j].x + ln.words[j].w; j++; }
          // La caja va centrada sobre las letras, no sobre la línea entera:
          // antes sobraba por arriba y quedaba descolgada.
          const padX = size * 0.16, padY = size * 0.15;
          const alto = mt.actualBoundingBoxAscent || size * 0.72, bajo = (mg.actualBoundingBoxDescent || size * 0.2) * 0.6;
          c.fillStyle = acentoDe(style);
          roundRect(c, left + sX - padX, y - alto - padY, (eX - sX) + padX * 2, alto + bajo + padY * 2, size * 0.18);
          c.fill();
          i = j;
        } else i++;
      }
      ln.words.forEach(t => {
        c.fillStyle = t.hl ? (style.highlightText || "#ffffff") : (t.ac ? acentoDe(style) : style.textColor);
        if (!t.hl) { c.shadowColor = "rgba(0,0,0,0.5)"; c.shadowBlur = size * 0.12; c.shadowOffsetY = size * 0.025; }
        c.fillText(t.text, left + t.x, y);
        c.shadowColor = "transparent"; c.shadowBlur = 0; c.shadowOffsetY = 0;
      });
      for (let k = 0; k < ln.words.length;) {
        if (ln.words[k].ul) {
          let j = k, sX = ln.words[k].x, eX = ln.words[k].x + ln.words[k].w;
          while (j < ln.words.length && ln.words[j].ul) { eX = ln.words[j].x + ln.words[j].w; j++; }
          c.strokeStyle = acentoDe(style); c.lineWidth = size * 0.1; c.lineCap = "round";
          const uy = y + size * 0.19;
          c.beginPath(); c.moveTo(left + sX, uy); c.lineTo(left + eX, uy); c.stroke();
          k = j;
        } else k++;
      }
      y += lh;
    });
  });
}

/* =========================================================================
 *  Drag
 * ========================================================================= */
function setupDrag() {
  const cv = editorCanvas;
  let target = null, start = null;
  const norm = e => { const r = cv.getBoundingClientRect(); return { nx: (e.clientX - r.left) / r.width, ny: (e.clientY - r.top) / r.height }; };
  const cl = (v, min, max) => (min > max ? (min + max) / 2 : Math.max(min, Math.min(max, v)));
  cv.addEventListener("pointerdown", e => {
    if (!state.active) return;
    const { nx, ny } = norm(e);
    const px = nx * CANVAS_W, py = ny * CANVAS_H;
    const slide = curSlide();
    const ins = slide.inset;
    if (ins && ins.img) {
      const iw = ins.scale * CANVAS_W, ih = iw * (ins.img.height / ins.img.width);
      const ix = ins.cx * CANVAS_W - iw / 2, iy = ins.cy * CANVAS_H - ih / 2;
      if (px >= ix && px <= ix + iw && py >= iy && py <= iy + ih) {
        target = "inset"; start = { nx, ny, cx: ins.cx, cy: ins.cy }; cv.setPointerCapture(e.pointerId); return;
      }
    }
    const b = slide._textBox;
    if (b && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
      target = "text"; start = { nx, ny, x: slide.pos.x, y: slide.pos.y }; cv.setPointerCapture(e.pointerId); return;
    }
    if (slide.bgIndex >= 0) {
      target = "bg"; start = { nx, ny, ox: slide.bg.ox, oy: slide.bg.oy }; cv.setPointerCapture(e.pointerId);
    }
  });
  cv.addEventListener("pointermove", e => {
    if (!target) return;
    const { nx, ny } = norm(e);
    const slide = curSlide();
    if (target === "inset") {
      const ins = slide.inset, hw = ins.scale / 2;
      const hh = (ins.scale * (ins.img.height / ins.img.width) * (CANVAS_W / CANVAS_H)) / 2;
      ins.cx = cl(start.cx + (nx - start.nx), SAFE.left + hw, SAFE.right - hw);
      ins.cy = cl(start.cy + (ny - start.ny), SAFE.top + hh, SAFE.bottom - hh);
    } else if (target === "text") {
      const b = slide._textBox, bh = b ? b.h / CANVAS_H : 0;
      slide.pos.x = cl(start.x + (nx - start.nx), 0.05, 0.70);
      slide.pos.y = cl(start.y + (ny - start.ny), SAFE.top, Math.max(SAFE.top, SAFE.bottom - bh));
    } else {
      slide.bg.ox = start.ox + (nx - start.nx);
      slide.bg.oy = start.oy + (ny - start.ny);
    }
    drawEditor();
  });
  const end = () => { if (target) { target = null; refreshActiveThumb(); persist(); } };
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);
  cv.style.touchAction = "none";
}

/* ---- Frames ---- */
function duplicateFrame() {
  const s = curSlide();
  const copy = makeSlide({ body: s.body, pos: { ...s.pos }, align: s.align, caso: s.caso, overlay: s.overlay, bg: { ...s.bg } });
  copy.bgIndex = s.bgIndex; copy.bgKey = s.bgKey; copy.inset = s.inset ? { ...s.inset } : null;
  copy.sticker = s.sticker ? JSON.parse(JSON.stringify(s.sticker)) : null;
  state.active.slides.splice(state.current + 1, 0, copy);
  state.current++; persist(); renderThumbs(); drawEditor();
}
function deleteFrame() {
  if (state.active.slides.length <= 1) { alert("Una secuencia necesita al menos un frame."); return; }
  if (!confirm("¿Borrar este frame?")) return;
  state.active.slides.splice(state.current, 1);
  state.current = Math.max(0, state.current - 1);
  persist(); renderThumbs(); drawEditor();
}
function moveFrame(dir) {
  const i = state.current, j = i + dir, a = state.active.slides;
  if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]]; state.current = j;
  persist(); renderThumbs(); drawEditor();
}

/* ---- Plantilla propia ---- */
/* Enviar a revisión.
 * Antes esto sólo marcaba la secuencia como "submitted", pero la cola del
 * admin lee la tabla de plantillas: el envío no llegaba a ninguna parte.
 * Ahora crea la plantilla candidata, que es lo que ABMedia revisa y publica. */
function abrirRevisionModal() {
  if (!state.active) return;
  if (!state.user) {
    aviso("Necesitas haber iniciado sesión para enviar una secuencia a revisión.", "error");
    return;
  }
  $("#revisionShare").checked = false;
  $("#revisionModal").classList.remove("hidden");
}
function cerrarRevisionModal() { $("#revisionModal").classList.add("hidden"); }

async function enviarARevision() {
  const s = state.active;
  if (!s || !state.user) return;
  const compartir = $("#revisionShare").checked;
  const btn = $("#revisionOk");
  btn.disabled = true;
  btn.textContent = "Enviando…";

  // Sólo viajan los textos y la estructura. Las fotos no salen del dispositivo.
  const tpl = {
    title: s.title || "Secuencia",
    category: s.category,
    style: JSON.parse(JSON.stringify(s.style)),
    slides: s.slides.map(sl => ({ body: sl.body, pos: { ...sl.pos }, align: sl.align, caso: sl.caso || null, overlay: sl.overlay, sticker: sl.sticker || null })),
    submitted: true,
    is_public: false,
    share_ok: compartir,
    review_status: "pendiente"
  };

  try {
    const row = await sbDB.sbUpsertTemplate(tpl);
    if (!row) throw new Error("La base de datos no ha aceptado el envío.");

    // Además del texto se suben los frames tal y como se ven, para que
    // ABMedia pueda juzgar también las fotos y su encuadre.
    btn.textContent = "Subiendo frames…";
    await subirVistasPrevias(row.id, s);

    s.submitted = true;
    persist();
    cerrarRevisionModal();
    aviso("Enviada. Te avisaremos en notificaciones cuando la revisemos.");
  } catch (e) {
    console.error("enviarARevision", e);
    aviso("No se ha podido enviar: " + (e.message || e), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Enviar";
  }
}

/* --------------------------- Avisos del cliente ----------------------- *
 * Aquí ve el veredicto de cada secuencia que mandó a revisión.
 * ---------------------------------------------------------------------- */
const AVISO_ESTADOS = {
  aprobada:  { icono: "✅", texto: "Aprobada",                       clase: "ok" },
  publicada: { icono: "✅", texto: "Aprobada y añadida a la biblioteca", clase: "ok guardada" },
  cambios:   { icono: "❌", texto: "Hay cambios que hacer",           clase: "ko" }
};

async function contarAvisos() {
  if (!state.user) return;
  const filas = await sbDB.sbFetchAvisos();
  state.avisos = filas;
  const sinLeer = filas.filter(f => !f.seen_by_owner).length;
  $("#avisosBadge").classList.toggle("hidden", sinLeer === 0);
}

async function renderAvisos() {
  const cont = $("#avisosList");
  cont.innerHTML = `<p class="empty">Cargando…</p>`;
  const filas = await sbDB.sbFetchAvisos();
  state.avisos = filas;
  if (!filas.length) {
    cont.innerHTML = `<p class="empty">Todavía no has enviado ninguna secuencia a revisión.</p>`;
    return;
  }
  cont.innerHTML = "";
  filas.forEach(f => cont.appendChild(filaAviso(f)));

  // Al abrir la sección se dan por leídos
  const sinLeer = filas.filter(f => !f.seen_by_owner);
  if (sinLeer.length) {
    await Promise.all(sinLeer.map(f => sbDB.sbMarcarAvisoLeido(f.id)));
    contarAvisos();
  }
}

function filaAviso(f) {
  const e = AVISO_ESTADOS[f.review_status] || AVISO_ESTADOS.aprobada;
  const cuando = f.reviewed_at ? new Date(f.reviewed_at).toLocaleDateString("es-ES") : "";
  const el = document.createElement("div");
  el.className = "aviso" + (f.seen_by_owner ? "" : " nuevo");
  el.innerHTML =
    `<div class="aviso-top">
       <span class="aviso-icono ${e.clase}">${e.icono}</span>
       <div class="aviso-txt">
         <strong>${escapeHtml(f.title || "Secuencia")}</strong>
         <span class="aviso-estado ${e.clase}">${e.texto}</span>
       </div>
       <span class="aviso-fecha">${cuando}</span>
       <button class="aviso-x" title="Quitar" aria-label="Quitar">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6 L18 18 M18 6 L6 18"/></svg>
       </button>
     </div>` +
    (f.review_note
      ? `<p class="aviso-nota">${escapeHtml(f.review_note).replace(/\n/g, "<br>")}</p>`
      : "");

  // Quitar un aviso concreto: se borra su envío, que ya está revisado
  el.querySelector(".aviso-x").addEventListener("click", async ev => {
    ev.stopPropagation();
    el.style.opacity = ".4";
    try {
      await sbDB.sbDeleteTemplate(f.id);
      el.remove();
      contarAvisos();
      if (!document.querySelectorAll("#avisosList .aviso").length) renderAvisos();
    } catch (e) {
      console.error("borrar aviso", e);
      el.style.opacity = "";
      aviso("No se ha podido quitar el aviso.", "error");
    }
  });
  return el;
}


/* =========================================================================
 *  Descargas
 * ========================================================================= */
function blobDownload(canvas, name) {
  return new Promise(res => canvas.toBlob(b => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = name; a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); res(); }, 400);
  }, "image/jpeg", 0.92));
}
/* Sube una imagen de cada frame del envío, a menor tamaño para no ocupar. */
async function subirVistasPrevias(idPlantilla, seq) {
  if (!window.sbRevision) return;
  const ANCHO = 540, ALTO = 960;
  for (let i = 0; i < seq.slides.length; i++) {
    try {
      const off = document.createElement("canvas");
      off.width = ANCHO; off.height = ALTO;
      drawSlide(off.getContext("2d"), seq.slides[i], ANCHO, ALTO, seq.style);
      const blob = await new Promise(r => off.toBlob(r, "image/jpeg", 0.82));
      if (blob) await sbRevision.sbSubirVistaPrevia(idPlantilla, i, blob);
    } catch (e) {
      console.warn("vista previa frame " + i, e);
    }
  }
}

function renderToBlob(slide) {
  const off = document.createElement("canvas"); off.width = CANVAS_W; off.height = CANVAS_H;
  drawSlide(off.getContext("2d"), slide, CANVAS_W, CANVAS_H, state.active.style);
  return new Promise(r => off.toBlob(r, "image/jpeg", 0.92));
}
async function downloadAll() {
  const base = (state.active.title || "story").replace(/[^\w]+/g, "-").slice(0, 24) || "story";
  const btn = $("#dlAll"), prev = btn.textContent; btn.disabled = true; btn.textContent = "Generando…";
  try {
    if (typeof JSZip !== "undefined") {
      const zip = new JSZip();
      for (let i = 0; i < state.active.slides.length; i++) zip.file(`${base}-${i + 1}.jpg`, await renderToBlob(state.active.slides[i]));
      const content = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(content); a.download = `${base}.zip`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    } else {
      const off = document.createElement("canvas"); off.width = CANVAS_W; off.height = CANVAS_H; const oc = off.getContext("2d");
      for (let i = 0; i < state.active.slides.length; i++) { drawSlide(oc, state.active.slides[i], CANVAS_W, CANVAS_H, state.active.style); await blobDownload(off, `${base}-${i + 1}.jpg`); }
    }
  } finally { btn.disabled = false; btn.textContent = prev; }
}

/* =========================================================================
 *  Modal "Nueva secuencia"
 * ========================================================================= */
const NEW_SEQ_OPTIONS = [
  { frames: 1, name: "1 historia" },
  { frames: 3, name: "3 historias" },
  { frames: 5, name: "5 historias" }
];
function openTemplateModal() {
  const box = $("#tplList"); box.innerHTML = "";
  NEW_SEQ_OPTIONS.forEach(opt => {
    const b = document.createElement("button"); b.className = "tpl-card";
    b.innerHTML = `<strong>${opt.name}</strong><em>${opt.frames} frame${opt.frames !== 1 ? "s" : ""} en blanco</em>`;
    b.addEventListener("click", () => {
      const cat = $("#newSeqCat").value;
      const seq = fromStructure(opt.frames, cat);
      state.sequences.unshift(seq); persist();
      $("#tplModal").classList.add("hidden"); openEditor(seq.id);
    });
    box.appendChild(b);
  });
  $("#tplModal").classList.remove("hidden");
}

/* =========================================================================
 *  Marcas inline
 * ========================================================================= */
/*
 * El texto de la story se edita con el formato a la vista.
 *
 * Antes era un cuadro de texto plano con las marcas escritas (==así==), y
 * Álvaro veía los iguales pegados a cada palabra. Ahora se ve el resaltado,
 * el subrayado y el acento tal cual, y las marcas sólo existen por dentro:
 * `slide.body` sigue guardando el mismo formato de siempre, así que el
 * dibujo, el guardado y las plantillas no cambian.
 *
 * Se trabaja con una lista de caracteres (unidades UTF-16, como cuenta el
 * navegador las posiciones del cursor; si no, un emoji lo descuadra), cada uno con sus tres marcas. Se
 * lee del editor, se cambia y se vuelve a pintar, y el cursor se recoloca
 * por su posición en el texto.
 */
const MARCAS = { hl: "==", ul: "__", ac: "**" };
function marcasAChars(body) {
  const chars = [];
  (body || "").split("\n").forEach((linea, i) => {
    if (i) chars.push({ ch: "\n" });
    tokenizeLine(linea).forEach(sg => { for (const ch of sg.text.split("")) chars.push({ ch, hl: sg.hl, ul: sg.ul, ac: sg.ac }); });
  });
  return chars;
}
function charsAMarcas(chars) {
  let out = "", ab = { hl: false, ul: false, ac: false };
  const cierra = () => { for (const k of ["ac", "ul", "hl"]) if (ab[k]) { out += MARCAS[k]; ab[k] = false; } };
  for (const c of chars) {
    if (c.ch === "\n") { cierra(); out += "\n"; continue; }
    for (const k of ["hl", "ul", "ac"]) if (!!c[k] !== ab[k]) { out += MARCAS[k]; ab[k] = !!c[k]; }
    out += c.ch;
  }
  cierra();
  return out;
}
function leeRico(root) {
  const chars = [];
  const rec = (el, f) => {
    el.childNodes.forEach(n => {
      if (n.nodeType === 3) { for (const ch of n.data.split("")) chars.push(ch === "\n" ? { ch } : { ch, ...f }); return; }
      if (n.nodeName === "BR") { if (!n.dataset.fin) chars.push({ ch: "\n" }); return; }
      const bloque = n.nodeName === "DIV" || n.nodeName === "P";
      if (bloque && chars.length && chars[chars.length - 1].ch !== "\n") chars.push({ ch: "\n" });
      const cl = n.classList || { contains: () => false };
      rec(n, { hl: f.hl || cl.contains("m-hl"), ul: f.ul || cl.contains("m-ul"), ac: f.ac || cl.contains("m-ac") });
    });
  };
  rec(root, { hl: false, ul: false, ac: false });
  return chars;
}
function pintaRico(root, chars) {
  let html = "", i = 0;
  while (i < chars.length) {
    const c = chars[i];
    if (c.ch === "\n") { html += "\n"; i++; continue; }
    let j = i, txt = "";
    while (j < chars.length && chars[j].ch !== "\n" && !!chars[j].hl === !!c.hl && !!chars[j].ul === !!c.ul && !!chars[j].ac === !!c.ac) txt += chars[j++].ch;
    const cls = ["hl", "ul", "ac"].filter(k => c[k]).map(k => "m-" + k).join(" ");
    html += cls ? `<span class="${cls}">${escapeHtml(txt)}</span>` : escapeHtml(txt);
    i = j;
  }
  // Un salto al final no se ve sin algo detrás
  if (!chars.length || chars[chars.length - 1].ch === "\n") html += '<br data-fin="1">';
  root.innerHTML = html;
  root.classList.toggle("vacio", !chars.length);
  const st = state.active?.style;
  if (st) {
    root.style.setProperty("--m-hl", acentoDe(st));
    root.style.setProperty("--m-hlt", st.highlightText || "#fff");
  }
}
const largoNodo = n => n.nodeType === 3 ? n.data.length : n.nodeName === "BR" ? (n.dataset.fin ? 0 : 1) : [...n.childNodes].reduce((a, x) => a + largoNodo(x), 0);
function posicionRico(root, nodo, off) {
  let n = 0, hecho = false;
  const rec = el => {
    for (let k = 0; k < el.childNodes.length && !hecho; k++) {
      const ch = el.childNodes[k];
      if (el === nodo && k === off) { hecho = true; return; }
      if (ch === nodo && ch.nodeType === 3) { n += off; hecho = true; return; }
      if (ch.contains(nodo) && ch !== nodo) { rec(ch); continue; }
      if (ch === nodo) { for (let q = 0; q < off; q++) n += largoNodo(ch.childNodes[q]); hecho = true; return; }
      n += largoNodo(ch);
    }
  };
  rec(root);
  return n;
}
function puntoRico(root, pos) {
  let quedan = pos;
  const rec = el => {
    for (const ch of el.childNodes) {
      if (ch.nodeType === 3) { if (quedan <= ch.data.length) return [ch, quedan]; quedan -= ch.data.length; continue; }
      if (ch.nodeName === "BR") { if (ch.dataset.fin) continue; if (quedan === 0) return [el, [...el.childNodes].indexOf(ch)]; quedan -= 1; continue; }
      const r = rec(ch); if (r) return r;
    }
    return null;
  };
  return rec(root) || [root, root.childNodes.length];
}
function seleccionRico(root) {
  const sel = getSelection();
  if (!sel.rangeCount || !root.contains(sel.anchorNode)) return null;
  const r = sel.getRangeAt(0);
  return [posicionRico(root, r.startContainer, r.startOffset), posicionRico(root, r.endContainer, r.endOffset)];
}
function colocaSeleccion(root, a, b = a) {
  const r = document.createRange();
  const [n1, o1] = puntoRico(root, a), [n2, o2] = puntoRico(root, b);
  r.setStart(n1, o1); r.setEnd(n2, o2);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
}
function guardaRico(chars) {
  const body = charsAMarcas(chars);
  curSlide().body = body;
  $("#bodyInput").value = body;
  drawEditor(); refreshActiveThumb();
}
function cambiaRico(root, chars, a, b) { pintaRico(root, chars); colocaSeleccion(root, a, b); guardaRico(chars); pintaBotonesMarca(); }

// Resaltar / subrayar / acento. Sin selección, se aplica a la palabra donde
// está el cursor; si todo lo elegido ya lo tiene, se quita.
function wrapSelection(marker) {
  const k = Object.keys(MARCAS).find(x => MARCAS[x] === marker);
  const root = $("#bodyRico");
  const chars = leeRico(root);
  let sel = seleccionRico(root) || _ultimaSel;
  if (!sel) return;
  let [a, b] = sel;
  if (a === b) {
    const esPal = i => chars[i] && !/\s/.test(chars[i].ch);
    while (a > 0 && esPal(a - 1)) a--;
    while (esPal(b)) b++;
  }
  while (a < b && /\s/.test(chars[a].ch)) a++;
  while (b > a && /\s/.test(chars[b - 1].ch)) b--;
  if (a === b) return;
  const tramo = chars.slice(a, b).filter(c => c.ch !== "\n");
  const poner = !tramo.every(c => c[k]);
  for (let i = a; i < b; i++) if (chars[i].ch !== "\n") chars[i][k] = poner;
  root.focus();
  cambiaRico(root, chars, sel[0] === sel[1] ? sel[0] : a, sel[0] === sel[1] ? sel[0] : b);
  if (poner && !state.active.style.highlightColor) pideAcento();
}
// Sin acento elegido, al marcar algo se abre el selector de color.
function pideAcento() {
  const inp = $("#highlightColor"); if (!inp) return;
  inp.closest("details")?.setAttribute("open", "");
  try { inp.showPicker ? inp.showPicker() : inp.click(); } catch { inp.click(); }
}
let _ultimaSel = null;
function pintaBotonesMarca() {
  const root = $("#bodyRico"); if (!root) return;
  const sel = seleccionRico(root);
  if (sel) _ultimaSel = sel;
  const chars = leeRico(root);
  const [a, b] = sel || [-1, -1];
  const trozo = sel ? (a === b ? [chars[a - 1] || chars[a]].filter(Boolean) : chars.slice(a, b).filter(c => c.ch.trim())) : [];
  [["hl", "#mkHighlight"], ["ul", "#mkUnderline"], ["ac", "#mkAccent"]].forEach(([k, id]) => {
    $(id)?.classList.toggle("on", trozo.length > 0 && trozo.every(c => c[k]));
  });
}
function montaRico() {
  const root = $("#bodyRico");
  if (!root) return;
  const inserta = texto => {
    const chars = leeRico(root);
    const [a, b] = seleccionRico(root) || [chars.length, chars.length];
    const plantilla = chars[a - 1] && chars[a - 1].ch !== "\n" ? chars[a - 1] : {};
    const nuevos = texto.replace(/\r/g, "").split("").map(ch => ch === "\n" ? { ch } : { ch, hl: plantilla.hl, ul: plantilla.ul, ac: plantilla.ac });
    chars.splice(a, b - a, ...nuevos);
    cambiaRico(root, chars, a + nuevos.length);
  };
  root.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); inserta("\n"); return; }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "u") { e.preventDefault(); wrapSelection("__"); }
    if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); wrapSelection("=="); }
    if (mod && e.key.toLowerCase() === "i") { e.preventDefault(); wrapSelection("**"); }
  });
  root.addEventListener("paste", e => { e.preventDefault(); inserta(e.clipboardData.getData("text/plain")); });
  root.addEventListener("drop", e => e.preventDefault());
  root.addEventListener("input", e => {
    if (e.isComposing) return;
    const sel = seleccionRico(root);
    const chars = leeRico(root);
    pintaRico(root, chars);
    if (sel) colocaSeleccion(root, sel[0], sel[1]);
    guardaRico(chars);
  });
  root.addEventListener("compositionend", () => root.dispatchEvent(new Event("input")));
  document.addEventListener("selectionchange", () => { if (document.activeElement === root) pintaBotonesMarca(); });
  // Que los botones no le quiten la selección al texto
  ["#mkHighlight", "#mkUnderline", "#mkAccent"].forEach(id => $(id)?.addEventListener("mousedown", e => e.preventDefault()));
}

/* =========================================================================
 *  TOUR
 * ========================================================================= */
const TOUR_KEY = "abmedia_tour_done_v3";
const TOUR_STEPS = [
  { view: "library", sel: '[data-tour="library"]', title: "Biblioteca",
    body: "Aquí están todas las secuencias preestablecidas y las tuyas. Filtra entre 'Todas' o 'Mis secuencias' y entra en una categoría (Personal, Venta o Nutrición) para verlas." },
  { view: "gallery", sel: '[data-tour="gallery"]', title: "Galería de imágenes",
    body: "Sube tu carpeta de fotos. Se quedan guardadas en tu navegador y se usan como fondo de las stories. Puedes vaciarlas o eliminar imágenes una a una." },
  { view: "gestion", sel: '[data-tour="gestion"]', title: "Gestión de stories",
    body: "Todas tus secuencias agrupadas por estado. Marca varias con la casilla —o con Mayúsculas para coger un rango— y cámbiales la fecha, la categoría, el estado o el título de golpe." },
  { view: "calendar", sel: '[data-tour="calendar"]', title: "Calendario de stories",
    body: "Te proponemos 3 publicaciones por semana. Pulsa cualquier día para abrir la secuencia y editarla con tus textos y fotos." },
  { view: "library", sel: '[data-tour="new"]', title: "Empezar a crear",
    body: "Cuando quieras una secuencia desde cero, pulsa este botón. Te deja elegir cuántos frames y la categoría." }
];
let tourIdx = 0;
let tourSpotEl = null;

function startTour(force = false) {
  if (!force && localStorage.getItem(TOUR_KEY)) return;
  tourIdx = 0;
  $("#tour").classList.remove("hidden");
  showTourStep();
}
function showTourStep() {
  const step = TOUR_STEPS[tourIdx];
  if (step.view && state.view !== step.view) setView(step.view);
  $("#tourStep").textContent = `${tourIdx + 1} / ${TOUR_STEPS.length}`;
  $("#tourTitle").textContent = step.title;
  $("#tourBody").textContent = step.body;
  $("#tourNext").textContent = tourIdx === TOUR_STEPS.length - 1 ? "Empezar →" : "Siguiente →";
  // Necesitamos un tick para que el DOM del setView esté pintado antes de medir
  setTimeout(() => positionTourSpot(step.sel), 30);
}
function positionTourSpot(selector) {
  if (tourSpotEl) tourSpotEl.remove();
  const el = document.querySelector(selector);
  if (!el) return;
  const r = el.getBoundingClientRect();
  tourSpotEl = document.createElement("div");
  tourSpotEl.className = "tour-spot";
  tourSpotEl.style.top = (r.top - 6) + "px";
  tourSpotEl.style.left = (r.left - 6) + "px";
  tourSpotEl.style.width = (r.width + 12) + "px";
  tourSpotEl.style.height = (r.height + 12) + "px";
  document.body.appendChild(tourSpotEl);
}
function nextTour() {
  tourIdx++;
  if (tourIdx >= TOUR_STEPS.length) { endTour(); return; }
  showTourStep();
}
function endTour() {
  $("#tour").classList.add("hidden");
  if (tourSpotEl) { tourSpotEl.remove(); tourSpotEl = null; }
  localStorage.setItem(TOUR_KEY, "1");
}

/* =========================================================================
 *  Eventos
 * ========================================================================= */
function bind() {
  editorCanvas = $("#editorCanvas");
  setupDrag();

  $$(".nav-item").forEach(n => n.addEventListener("click", () => setView(n.dataset.view)));

  $("#libCat").addEventListener("click", e => {
    const b = e.target.closest("[data-libcat]"); if (!b) return;
    state.libraryCat = b.dataset.libcat; renderLibrary();
  });
  $("#libBusca").addEventListener("input", e => {
    state.libraryBusca = e.target.value;
    renderLibrary();
  });
  $("#catalogGrid").addEventListener("click", e => {
    const pl = e.target.closest("[data-libplegar]");
    if (pl) {
      const k = pl.dataset.libplegar;
      const l = state.libPlegados || (state.libPlegados = []);
      const i = l.indexOf(k); i >= 0 ? l.splice(i, 1) : l.push(k);
      return renderLibrary();
    }
    const usar = e.target.closest("[data-usar]");
    if (usar) verPlantilla(usar.dataset.usar);
  });

  // Galería
  const gDrop = $("#galleryDrop");
  gDrop.addEventListener("click", () => $("#galleryInput").click());
  $("#galleryPickBtn").addEventListener("click", e => { e.stopPropagation(); $("#galleryInput").click(); });
  $("#galleryClearBtn").addEventListener("click", e => { e.stopPropagation(); clearGallery(); });
  $("#galCtx").addEventListener("click", e => {
    const b = e.target.closest("[data-galctx]"); if (!b) return;
    state.galCtx = b.dataset.galctx; renderGallery();
  });
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-galpon]"); if (!b) return;
    e.preventDefault();
    const que = b.dataset.galpon;
    if (que === "nada" || que === "ninguna") { FOTOS_SEL.clear(); return renderGallery(); }
    if (que === "todas") { fotosVisibles().forEach(im => FOTOS_SEL.add(im.key)); return renderGallery(); }
    const fotos = state.images.filter(im => FOTOS_SEL.has(im.key));
    await ponTipos(fotos, que || null);
    FOTOS_SEL.clear();
    renderGallery();
    aviso(`${fotos.length} ${fotos.length === 1 ? "foto marcada" : "fotos marcadas"} como ${TIPOS_FOTO[que] ? TIPOS_FOTO[que].nombre : "sin tipo"}`);
  });
  $("#galleryInput").addEventListener("change", e => loadFiles(e.target.files));
  ["dragover", "dragenter"].forEach(ev => gDrop.addEventListener(ev, e => { e.preventDefault(); gDrop.classList.add("hover"); }));
  ["dragleave", "drop"].forEach(ev => gDrop.addEventListener(ev, e => { e.preventDefault(); gDrop.classList.remove("hover"); }));
  gDrop.addEventListener("drop", e => loadFiles(e.dataTransfer.files));

  // Drop editor
  const drop = $("#editorDrop");
  drop.addEventListener("click", () => $("#fileInput2").click());
  $("#fileInput2").addEventListener("change", e => loadFiles(e.target.files));
  ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("hover"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("hover"); }));
  drop.addEventListener("drop", e => loadFiles(e.dataTransfer.files));

  // Ideas

  // Calendar
  $("#calPrev").addEventListener("click", () => calMove(-1));
  $("#calNext").addEventListener("click", () => calMove(1));
  $("#calPropuesta").addEventListener("click", abrePropuesta);

  // Elegir qué secuencia se añade a un día concreto
  $("#seqPeekClose").addEventListener("click", closeSeqPeek);
  $("#seqPeekOpen").addEventListener("click", peekOpenInEditor);
  $("#seqPeekFrames").addEventListener("click", e => {
    const f = e.target.closest("[data-pk]"); if (f) return muevePeek(Number(f.dataset.pk));
    const m = e.target.closest("[data-pk-ir]"); if (m) { _peekFrame = Number(m.dataset.pkIr); pintaVisor(); }
  });
  document.addEventListener("keydown", e => {
    if ($("#seqPeekModal").classList.contains("hidden")) return;
    if (e.key === "ArrowLeft") muevePeek(-1);
    if (e.key === "ArrowRight") muevePeek(1);
  });
  $("#seqPeekRemove").addEventListener("click", peekRemoveFromDay);
  $("#seqPeekOtra").addEventListener("click", () => {
    if (!_peek || _peek.lib) return;
    const sq = secuenciaDeTag(_peek.entry);
    if (!cambiaPorOtra(sq)) return;
    $("#seqPeekTitle").textContent = sq.title;
    _peekSeq = sq; _peekFrame = 0; pintaVisor();
    refrescaTrasCambio();
  });
  $("#seqPeekModal").addEventListener("click", e => {
    if (e.target.id === "seqPeekModal") closeSeqPeek();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("#seqPeekModal").classList.contains("hidden")) closeSeqPeek();
  });

  $("#calPickClose").addEventListener("click", closeCalPicker);
  $("#calPickSearch").addEventListener("input", renderCalPickList);
  $("#calPickModal").addEventListener("click", e => {
    if (e.target.id === "calPickModal") closeCalPicker();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("#calPickModal").classList.contains("hidden")) closeCalPicker();
  });

  // Nueva secuencia
  $("#newSeq").addEventListener("click", openTemplateModal);
  $("#tplClose").addEventListener("click", () => $("#tplModal").classList.add("hidden"));
  $("#tplModal").addEventListener("click", e => { if (e.target.id === "tplModal") $("#tplModal").classList.add("hidden"); });

  // Editor
  $("#editorClose").addEventListener("click", closeEditor);
  $("#editorTitle").addEventListener("input", e => { state.active.title = e.target.value; });
  $("#statusSelect").addEventListener("change", e => {
    state.active.status = e.target.value;
    if (e.target.value !== "scheduled") {
      state.active.scheduledDate = null;
      removeScheduleEntriesForSeq(state.active.id);
      storeSched.save(state.schedule);
    }
    syncSchedDate(); persist();
  });
  $("#catSelect").addEventListener("change", e => { state.active.category = e.target.value; persist(); });
  $("#schedDate").addEventListener("change", e => {
    if (!state.active) return;
    const v = e.target.value || null;
    state.active.scheduledDate = v;
    setScheduleForSequence(state.active, v);
    persist();
  });
  $("#dupFrame").addEventListener("click", duplicateFrame);
  $("#delFrame").addEventListener("click", deleteFrame);
  $("#moveFramePrev").addEventListener("click", () => moveFrame(-1));
  $("#moveFrameNext").addEventListener("click", () => moveFrame(1));
  $("#bgZoom").addEventListener("input", e => { curSlide().bg.zoom = parseFloat(e.target.value); drawEditor(); refreshActiveThumb(); });
  $("#bgZoom").addEventListener("change", persist);
  montaRico();
  document.querySelectorAll("[data-caso]").forEach(b => {
    b.addEventListener("mousedown", e => e.preventDefault());
    b.addEventListener("click", () => {
      curSlide().caso = b.dataset.caso || null;
      renderEditPanel(); drawEditor(); refreshActiveThumb(); persist();
    });
  });
  $("#alignChips").addEventListener("click", e => {
    const b = e.target.closest("[data-align]"); if (!b) return;
    const sl = curSlide();
    sl.align = b.dataset.align;
    // Centrado, derecha y justificado ocupan todo el ancho seguro; si el
    // texto estaba movido a un lado, el centro no quedaría en el centro.
    if (sl.align !== "left") sl.pos.x = TXT.left;
    $("#alignChips").querySelectorAll("[data-align]").forEach(x => x.classList.toggle("on", x === b));
    drawEditor(); refreshActiveThumb(); persist();
  });
  // Overlay chips
  $$(".chip-vis").forEach(c => c.addEventListener("click", () => {
    curSlide().overlay = c.dataset.overlay;
    syncOverlayChips(); drawEditor(); refreshActiveThumb(); persist();
  }));
  $("#mkHighlight").addEventListener("click", () => wrapSelection("=="));
  $("#mkUnderline").addEventListener("click", () => wrapSelection("__"));
  $("#mkAccent").addEventListener("click", () => wrapSelection("**"));
  // Font chips
  buildFontChips();
  $("#highlightColor").addEventListener("input", e => { state.active.style.highlightColor = e.target.value; recuerdaAcento(e.target.value); updateColorDots(); drawEditor(); renderThumbs(); persist(); });
  $("#textColor").addEventListener("input", e => { state.active.style.textColor = e.target.value; updateColorDots(); drawEditor(); renderThumbs(); persist(); });
  $("#sizeRange").addEventListener("input", e => { state.active.style.size = parseFloat(e.target.value); drawEditor(); refreshActiveThumb(); });
  $("#sizeRange").addEventListener("change", persist);
  document.querySelectorAll("[data-elige-tipo]").forEach(b => b.addEventListener("click", () => abreFotosTipo(b.dataset.eligeTipo)));
  const campoSticker = (id, aplica) => $(id).addEventListener("input", e => {
    const st = curSlide().sticker; if (!st) return;
    aplica(st, e.target.value); drawEditor(); refreshActiveThumb(); persist();
  });
  campoSticker("#stkTexto", (st, v) => { st.texto = v; });
  campoSticker("#stkOp1", (st, v) => { st.opciones = [v, (st.opciones || [])[1] || ""]; });
  campoSticker("#stkOp2", (st, v) => { st.opciones = [(st.opciones || [])[0] || "", v]; });
  campoSticker("#stkEmoji", (st, v) => { st.emoji = v; });
  campoSticker("#stkY", (st, v) => { st.y = Number(v); });
  $("#newImg").addEventListener("click", () => {
    const n = state.images.length; if (n <= 1) return;
    const slide = curSlide(); let next; do { next = Math.floor(Math.random() * n); } while (next === slide.bgIndex);
    ponFondo(slide, next); drawEditor(); refreshActiveThumb(); persist();
  });
  $("#insetBtn").addEventListener("click", () => $("#insetInput").click());
  $("#insetInput").addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => { curSlide().inset = { img, cx: 0.5, cy: 0.62, scale: 0.62 }; drawEditor(); refreshActiveThumb(); renderEditPanel(); };
    img.src = URL.createObjectURL(f);
    e.target.value = "";
  });
  $("#insetSize").addEventListener("input", e => { if (curSlide().inset) { curSlide().inset.scale = parseFloat(e.target.value); drawEditor(); refreshActiveThumb(); } });
  $("#insetRemove").addEventListener("click", () => { curSlide().inset = null; drawEditor(); refreshActiveThumb(); renderEditPanel(); });

  $("#saveBtn").addEventListener("click", async () => {
    const b = $("#saveBtn"), prev = b.innerHTML;
    b.disabled = true; b.textContent = "Guardando…";
    try {
      await persistAhora();
      b.textContent = "✓ Guardada en Mis secuencias";
      // La biblioteca se repinta: antes había que refrescar la página para
      // ver la secuencia recién guardada en "Mis secuencias".
      renderAll();
    } catch (e) {
      console.error("guardar", e);
      b.textContent = "No se ha podido guardar";
    }
    setTimeout(() => { b.innerHTML = prev; b.disabled = false; }, 1800);
  });
  $("#submitBtn").addEventListener("click", abrirRevisionModal);
  $("#revisionClose").addEventListener("click", cerrarRevisionModal);
  $("#revisionCancel").addEventListener("click", cerrarRevisionModal);
  $("#revisionOk").addEventListener("click", enviarARevision);
  $("#revisionModal").addEventListener("click", e => {
    if (e.target.id === "revisionModal") cerrarRevisionModal();
  });
  $("#dlOne").addEventListener("click", async () => {
    const blob = await renderToBlob(curSlide());
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `story-${state.current + 1}.jpg`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("#dlAll").addEventListener("click", downloadAll);

  // Tour
  $("#tourNext").addEventListener("click", nextTour);
  $("#tourSkip").addEventListener("click", endTour);
  $("#restartTourBtn").addEventListener("click", () => startTour(true));
  $("#avisosTab").addEventListener("click", () => setView("avisos"));

  /* ---- Gestión de stories ---- */
  $("#gestionNueva").addEventListener("click", () => $("#newSeq").click());
  $("#gestionBusca").addEventListener("input", e => {
    state.gestionBusca = e.target.value;
    renderGestion();
    // El buscador se rehace con la vista, así que hay que devolverle el foco.
    const c = $("#gestionBusca"); c.focus(); c.setSelectionRange(c.value.length, c.value.length);
  });
  $("#gestionCat").addEventListener("click", e => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    state.gestionCat = b.dataset.cat; renderGestion();
  });
  $("#gestionVista").addEventListener("click", e => {
    const b = e.target.closest("[data-vista]"); if (!b) return;
    state.gestionVista = b.dataset.vista; renderGestion();
  });
  $("#gestionCuerpo").addEventListener("click", e => {
    const plegar = e.target.closest("[data-plegar]");
    if (plegar) {
      const id = plegar.dataset.plegar;
      const l = state.gestionPlegados || (state.gestionPlegados = []);
      const i = l.indexOf(id); i >= 0 ? l.splice(i, 1) : l.push(id);
      return renderGestion();
    }
    const abrir = e.target.closest("[data-abrir]");
    if (abrir) {
      e.preventDefault();
      const q = state.sequences.find(x => String(x.id) === abrir.dataset.abrir);
      if (q) openEditor(q.id);
    }
  });

  /* Arrastrar una secuencia a otro estado. Si la que coges está marcada, se
     mueven todas las marcadas: es lo que uno espera al arrastrar un grupo. */
  const cuerpoG = $("#gestionCuerpo");
  let arrastrando = null;
  cuerpoG.addEventListener("dragstart", e => {
    const el = e.target.closest("[data-arrastra]"); if (!el) return;
    const id = el.dataset.arrastra;
    arrastrando = SELECCION.has(id) ? [...SELECCION] : [id];
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", id); } catch {}
    setTimeout(() => el.classList.add("arrastrando"), 0);
  });
  cuerpoG.addEventListener("dragend", e => {
    e.target.closest("[data-arrastra]")?.classList.remove("arrastrando");
    cuerpoG.querySelectorAll(".soltar-aqui").forEach(x => x.classList.remove("soltar-aqui"));
    arrastrando = null;
  });
  cuerpoG.addEventListener("dragover", e => {
    const zona = e.target.closest("[data-soltar-estado]"); if (!zona || !arrastrando) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    cuerpoG.querySelectorAll(".soltar-aqui").forEach(x => { if (x !== zona) x.classList.remove("soltar-aqui"); });
    zona.classList.add("soltar-aqui");
  });
  cuerpoG.addEventListener("dragleave", e => {
    const zona = e.target.closest("[data-soltar-estado]");
    if (zona && !zona.contains(e.relatedTarget)) zona.classList.remove("soltar-aqui");
  });
  cuerpoG.addEventListener("drop", e => {
    const zona = e.target.closest("[data-soltar-estado]"); if (!zona || !arrastrando) return;
    e.preventDefault();
    const estado = zona.dataset.soltarEstado;
    const seqs = state.sequences.filter(x => arrastrando.includes(String(x.id)) && estadoDe(x) !== estado);
    arrastrando = null;
    if (!seqs.length) return renderGestion();
    guardaEnLote(seqs, x => { x.status = estado; });
    aviso(`${seqs.length === 1 ? "Movida" : seqs.length + " movidas"} a ${STATUS[estado].label}`);
  });

  /* La casilla no abre la secuencia: se queda el clic. En captura, porque el
     enlace de la fila está por encima. */
  document.addEventListener("click", e => {
    const m = e.target.closest("[data-sel]");
    if (!m) return;
    e.preventDefault(); e.stopPropagation();
    alternaMarca(m.dataset.sel, e.shiftKey, m);
  }, true);
  document.addEventListener("keydown", e => {
    const m = e.target.closest && e.target.closest("[data-sel]");
    if (m && (e.key === " " || e.key === "Enter")) { e.preventDefault(); alternaMarca(m.dataset.sel, e.shiftKey, m); }
  });

  /* La barra de abajo. */
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-bs]");
    if (!b) return;
    e.preventDefault();
    const seqs = seleccionadas();
    if (!seqs.length) return limpiaSeleccion();
    const que = b.dataset.bs;
    if (que === "nada") return limpiaSeleccion();
    if (que === "fecha") return ponFechaEnLote(seqs);
    if (que === "categoria") return ponCategoriaEnLote(seqs);
    if (que === "estado") return ponEstadoEnLote(seqs);
    if (que === "titulo") return ponTituloEnLote(seqs);
    if (que === "borrar") return borraEnLote(seqs);
  });

  // La marca lleva a la biblioteca, como el logo de Content OS lleva al inicio.
  $("#btnHome").addEventListener("click", () => setView("library"));

  /* Encoger el lateral. Se recuerda porque quien lo encoge lo quiere encogido
     siempre, no sólo en esta pestaña. */
  const plegar = (v) => {
    document.body.classList.toggle("lateral-plegada", v);
    $("#btnPlegar").setAttribute("aria-expanded", String(!v));
    $("#btnPlegar").title = v ? "Desplegar el menú" : "Encoger el menú";
    try { localStorage.setItem("abmedia_lateral", v ? "1" : "0"); } catch {}
  };
  $("#btnPlegar").addEventListener("click", () =>
    plegar(!document.body.classList.contains("lateral-plegada")));
  try { if (localStorage.getItem("abmedia_lateral") === "1") plegar(true); } catch {}
  $("#miasFiltro").addEventListener("click", e => {
    const b = e.target.closest("[data-miascat]"); if (!b) return;
    state.miasFiltro = b.dataset.miascat; renderMias();
  });

  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#overlay").classList.contains("hidden")) closeEditor(); });
  window.addEventListener("resize", () => { if (!$("#tour").classList.contains("hidden")) positionTourSpot(TOUR_STEPS[tourIdx]?.sel); });
}

/* =========================================================================
 *  Fuentes (chips visuales)
 * ========================================================================= */
/*
 * Las tipografías de Google no se cargan todas al abrir la web: sería
 * pesado. La lista se enseña con una muestra mínima de cada una (sólo las
 * letras de su nombre, un pedido pequeñito) y la fuente entera se pide al
 * elegirla o al pintar una secuencia que la usa. El lienzo no espera a las
 * fuentes, así que cuando llega una se repinta lo que haya a la vista.
 */
const familiaDe = f => f.fam || (f.value.match(/^\s*"([^"]+)"/) || [])[1] || "";
const fuenteDe = value => FONTS.find(f => f.value === value);
const muestraDe = f => f.google ? `"${familiaDe(f)} muestra", ${f.value}` : f.value;
const _fuentePedida = new Set(), _fuenteLista = new Set();
const _fuenteEnCamino = new Map();
function cargaFuente(value) {
  // Cada dibujo pregunta por su fuente: si ya está en camino se devuelve la
  // misma espera, en vez de abrir otra por cada miniatura (eso atascaba).
  if (_fuenteEnCamino.has(value)) return _fuenteEnCamino.get(value);
  const p = cargaFuenteYa(value);
  _fuenteEnCamino.set(value, p);
  p.then(ok => { if (!ok) _fuenteEnCamino.delete(value); });
  return p;
}
function cargaFuenteYa(value) {
  const f = fuenteDe(value);
  if (!f || !f.google || _fuenteLista.has(value)) return Promise.resolve(false);
  const fam = familiaDe(f);
  if (!_fuentePedida.has(fam)) {
    _fuentePedida.add(fam);
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, "+")}:wght@${f.w}&display=swap`;
    document.head.appendChild(l);
  }
  return new Promise(res => {
    let intentos = 0;
    // Se pide con letras de verdad (incluidas tildes y ñ) para que carguen
    // los trozos de la fuente que las contienen, no sólo el primero.
    const mira = () => document.fonts.load(`${f.w} 40px "${fam}"`, "AaÁáÉéÍíÓóÚúÑñÜü¿?¡!0123456789 abcdefghijklmnopqrstuvwxyz").then(r => {
      if (r.length) { _fuenteLista.add(value); res(true); }
      else if (++intentos < 20) setTimeout(mira, 250); else res(false);
    }).catch(() => res(false));
    mira();
  });
}
let _repintarFuentes = null;
function aseguraFuente(style) {
  const f = style && fuenteDe(style.font);
  if (!f || !f.google || _fuenteLista.has(f.value)) return;
  if (_fuenteEnCamino.has(f.value)) return;
  cargaFuente(f.value).then(ok => {
    if (!ok) return;
    clearTimeout(_repintarFuentes);
    _repintarFuentes = setTimeout(() => {
      if (state.active) { drawEditor(); renderThumbs(); }
      if (_peekSeq && !$("#seqPeekModal").classList.contains("hidden")) pintaVisor();
      if (state.view === "calendar" && typeof renderCalendar === "function") renderCalendar();
    }, 60);
  });
}
/* La tipografía se elige en un desplegable junto a la alineación. Cada
   nombre va escrito en su letra (con una muestra mínima de la fuente: sólo
   las letras del nombre) y agrupado: Sans, Display, Serif, Manuscrita. */
function buildFontChips() {
  const btn = $("#fuenteCampo"); if (!btn) return;
  const google = FONTS.filter(f => f.google);
  const letras = [...new Set(google.map(f => f.name).join(""))].join("");
  /* La muestra (sólo las letras del nombre) se registra con OTRO nombre de
     familia: «X muestra». Si llevara el nombre de verdad, el navegador la daba
     por cargada y el lienzo pintaba con ella, y las letras que no están en el
     nombre salían en otra fuente o no se actualizaban. */
  const url = "https://fonts.googleapis.com/css2?" + google.map(f => "family=" + encodeURIComponent(familiaDe(f)).replace(/%20/g, "+") + ":wght@" + f.w).join("&") + "&text=" + encodeURIComponent(letras) + "&display=swap";
  fetch(url).then(r => r.ok ? r.text() : "").then(css => {
    if (!css) return;
    const st = document.createElement("style");
    st.textContent = css.replace(/font-family:\s*'([^']+)'/g, (m, fam) => `font-family: '${fam} muestra'`);
    document.head.appendChild(st);
  }).catch(() => {});
  btn.addEventListener("click", e => { e.stopPropagation(); abreListaFuentes(btn); });
}
function abreListaFuentes(btn) {
  const abierto = btn.classList.contains("abierto");
  cierraDesplegable(); cierraSelectorFecha();
  if (abierto || !state.active) return;
  btn.classList.add("abierto");
  const actual = state.active.style.font;
  let grupo = "", html = "";
  FONTS.forEach((f, i) => {
    if (f.grupo !== grupo) { grupo = f.grupo; html += `<span class="ds-grupo">${grupo}</span>`; }
    const on = f.value === actual;
    html += `<button type="button" class="ds-op${on ? " activo" : ""}" data-fuente="${i}"><span style="font-family:${escapeAttr(muestraDe(f))};font-weight:${f.w};font-size:15px">${escapeHtml(f.name)}</span>${on ? SVG_CHECK : ""}</button>`;
  });
  const lista = document.createElement("div");
  lista.className = "ds-lista ds-fuentes";
  lista.innerHTML = html;
  document.body.appendChild(lista);
  lista.style.minWidth = Math.max(220, btn.getBoundingClientRect().width) + "px";
  colocaPop(lista, btn);
  lista.querySelector(".ds-op.activo")?.scrollIntoView({ block: "center" });
  lista.querySelectorAll("[data-fuente]").forEach(op => op.addEventListener("click", () => {
    const f = FONTS[+op.dataset.fuente];
    state.active.style.font = f.value;
    state.active.style.weight = f.w;
    recuerdaFuente(f.name);
    cierraDesplegable();
    syncFontChips();
    drawEditor(); renderThumbs(); persist();
    aseguraFuente(state.active.style);
  }));
}
function fillFontSelect() { /* deprecated — sustituido por buildFontChips */ }

/* =========================================================================
 *  AUTH + arranque
 * ========================================================================= */
async function bootLoggedIn(user) {
  state.user = user;
  state.isAdminUser = sbAuth.isAdmin(user);

  // Whitelist: si no eres admin ni estás en allowed_users → fuera
  if (!state.isAdminUser) {
    const ok = await sbAuth.sbIsAllowed(user.email);
    if (!ok) {
      document.getElementById("loginScreen").classList.add("hidden");
      document.getElementById("appRoot").classList.add("hidden");
      const na = document.getElementById("notAllowed");
      if (na) {
        na.classList.remove("hidden");
        const em = document.getElementById("notAllowedEmail");
        if (em) em.textContent = user.email || "";
      }
      return;
    }
  }

  document.getElementById("notAllowed")?.classList.add("hidden");
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appRoot").classList.remove("hidden");
  document.getElementById("userEmail").textContent = user.email || "";
  document.getElementById("adminTab").classList.toggle("hidden", !state.isAdminUser);
  await Promise.all([cargaAcento(user.id), cargaFuentePreferida(user.id)]);

  // Cada cuenta tiene su propia galería en este navegador
  imgDB.usarCuenta(user.id);
  /* Las claves de antes eran de todo el navegador y no se sabe de qué cuenta
     eran, así que no se le dan a nadie: se borran. Lo de cada uno vuelve de
     la nube —secuencias, plantillas y las fechas de sus secuencias—; sólo se
     pierden las propuestas del catálogo que hubiera en el calendario. */
  try {
    ["abmedia_sequences_v3", "abmedia_schedule_v1", "abmedia_user_templates_v2"]
      .forEach(k => localStorage.removeItem(k));
  } catch {}
  // Pide al navegador que no borre las fotos si va justo de espacio
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch {}
  await migrarGaleriaAntigua();

  // Primero lo que ya está en este equipo, para pintar cuanto antes
  await loadImagesFromDB();
  // y después se completa con lo que haya en la nube, marcas incluidas
  sincronizarFotos().then(sincronizarTipos);

  const cloudSeqs = await sbDB.sbFetchSequences();
  if (cloudSeqs.length) {
    const sinFotoGuardada = [];
    state.sequences = cloudSeqs.map(r => {
      const seq = instantiate({ title: r.title, category: r.category, status: r.status, submitted: r.submitted, style: r.style, slides: r.slides });
      seq.cloudId = r.id;
      if ((r.slides || []).some(sl => !sl.bgKey) && state.images.length) sinFotoGuardada.push(seq);
      return seq;
    });
    // Las de antes de guardar la foto de cada frame: el reparto que acaban de
    // recibir se guarda ya, y desde ahora no cambia al recargar.
    sinFotoGuardada.forEach(guardarSecuencia);
  } else {
    state.sequences = [];
  }
  // El catálogo manda desde la base de datos, pero SIN borrar lo que el
  // fichero tenga y la base no. Cuando se pasó el catálogo a Supabase sólo
  // subieron tres categorías de cinco: al sustituir la lista entera,
  // Personal y Venta desaparecieron de la biblioteca de todo el mundo.
  // Fusionar en vez de sustituir hace que eso no pueda repetirse: falte lo
  // que falte en la base, el cliente sigue viendo el catálogo completo.
  const cat = await sbDB.sbFetchCatalogo();
  if (cat && cat.length) {
    const enLaBase = new Set(cat.map(c => c.id));
    const soloEnFichero = CATALOG.filter(c => !enLaBase.has(c.id));
    CATALOG.length = 0;
    CATALOG.push(...cat, ...soloEnFichero);
  }

  const cloudTpls = await sbDB.sbFetchTemplates("mine");
  state.userTemplates = cloudTpls.map(r => ({ id: "u" + r.id, cloudId: r.id, title: r.title, category: r.category, style: r.style, slides: r.slides, submitted: r.submitted, isUser: true }));

  state.schedule = storeSched.load() || {};
  state.calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  rebuildScheduleFromSequences();

  // Vuelve a donde estabas antes de recargar, no siempre a la biblioteca
  let vistaGuardada = "library";
  try { vistaGuardada = localStorage.getItem("abmedia_vista") || "library"; } catch {}
  const validas = ["library", "mias", "gallery", "gestion", "calendar", "avisos"];
  setView(validas.includes(vistaGuardada) ? vistaGuardada : "library");
  contarAvisos();
  setTimeout(() => startTour(false), 600);
}

function showLogin() {
  document.getElementById("notAllowed")?.classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("appRoot").classList.add("hidden");
}

// Botón "Cerrar sesión" en la pantalla de no-autorizado
document.addEventListener("DOMContentLoaded", () => {
  const b = document.getElementById("notAllowedLogout");
  if (b) b.addEventListener("click", async () => { await sbAuth.sbSignOut(); });
});

function bindLogin() {
  let mode = "signin";
  const err = document.getElementById("loginError");
  const setMode = m => {
    mode = m;
    document.getElementById("loginTitle").textContent = m === "signin" ? "Inicia sesión" : "Crear cuenta";
    document.getElementById("loginBtn").textContent = m === "signin" ? "Entrar" : "Crear cuenta";
    document.getElementById("signupToggle").textContent = m === "signin" ? "¿No tienes cuenta? Crear una" : "Ya tengo cuenta, iniciar sesión";
    err.textContent = "";
  };
  document.getElementById("signupToggle").addEventListener("click", () => setMode(mode === "signin" ? "signup" : "signin"));
  document.getElementById("loginBtn").addEventListener("click", async () => {
    err.textContent = "";
    const email = document.getElementById("loginEmail").value.trim();
    const pass = document.getElementById("loginPass").value;
    if (!email || !pass) { err.textContent = "Email y contraseña requeridos."; return; }
    try {
      if (mode === "signin") { await sbAuth.sbSignIn(email, pass); }
      else {
        await sbAuth.sbSignUp(email, pass);
        const s = await sbAuth.sbGetSession();
        if (!s) { err.textContent = "Cuenta creada. Revisa tu email para confirmar y vuelve a iniciar sesión."; return; }
      }
    } catch (e) { err.textContent = e.message || "Error al iniciar sesión."; }
  });
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    // Al salir se suelta la galería de esta cuenta: si entra otra persona en
    // el mismo navegador no ve ni por un momento las fotos de la anterior.
    state.images = [];
    state.avisos = [];
    state.sequences = [];
    state.userTemplates = [];
    state.schedule = {};
    FOTOS_SEL.clear();
    SELECCION.clear();
    document.getElementById("barraFotos")?.remove();
    document.getElementById("barraSel")?.remove();
    // Las vistas pintadas siguen en la página, escondidas: se vacían para
    // que no quede ni una miniatura de esta cuenta en el HTML.
    ["#galleryGrid", "#miasGrid", "#gestionCuerpo", "#calGrid", "#bgPicker"]
      .forEach(sel => { const el = document.querySelector(sel); if (el) el.innerHTML = ""; });
    imgDB.usarCuenta(null);
    await sbAuth.sbSignOut();
  });
}

let _bootingFor = null;
async function bootOnce(user) {
  if (_bootingFor === user.id) return;
  _bootingFor = user.id;
  await bootLoggedIn(user);
}

/*
 * ¿Hay una versión publicada más nueva que la que está abierta?
 *
 * GitHub Pages deja guardar la página hasta 10 minutos, y una pestaña que se
 * deja abierta sigue con el código de cuando se abrió. Así se estuvo mirando
 * una versión vieja creyendo que un arreglo no funcionaba. Cada 5 minutos, y
 * al volver a la pestaña, se mira qué versión de app.js pide la página
 * publicada; si no es la cargada, se avisa con un botón para recargar.
 */
function vigilaVersion() {
  const actual = (document.querySelector('script[src^="app.js"]')?.getAttribute("src").match(/v=(\d+)/) || [])[1];
  if (!actual) return;
  let avisado = false;
  const mira = async () => {
    if (avisado || document.visibilityState !== "visible") return;
    try {
      const html = await (await fetch(location.pathname + "?comprobar=" + Date.now(), { cache: "no-store" })).text();
      const publicada = (html.match(/app\.js\?v=(\d+)/) || [])[1];
      if (publicada && Number(publicada) > Number(actual)) { avisado = true; avisaVersionNueva(); }
    } catch {}
  };
  setInterval(mira, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", mira);
}
function avisaVersionNueva() {
  if (document.getElementById("versionNueva")) return;
  const el = document.createElement("div");
  el.id = "versionNueva"; el.className = "version-nueva";
  el.innerHTML = `<span>Hay una versión nueva del Builder</span><button class="btn sm primary">Recargar</button>`;
  el.querySelector("button").addEventListener("click", () => location.reload());
  document.body.appendChild(el);
}

async function init() {
  fillFontSelect();
  bind();
  mejorarCampos();
  bindLogin();
  vigilaVersion();

  sb.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) await bootOnce(session.user);
    else { state.user = null; _bootingFor = null; showLogin(); }
  });

  const s = await sbAuth.sbGetSession();
  if (s) await bootOnce(s.user);
  else showLogin();
}
document.addEventListener("DOMContentLoaded", init);
