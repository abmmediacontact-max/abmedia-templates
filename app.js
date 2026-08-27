/* =========================================================================
 *  Sequence Builder · ABMedia
 * ========================================================================= */

const state = {
  user: null,
  isAdminUser: false,
  images: [],
  sequences: [],
  userTemplates: [],
  publicTemplates: [],
  reviewQueue: [],
  inbox: [],
  active: null,
  current: 0,
  view: "library",
  libraryStage: "categories",
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
  async put(name, blob, key) {
    const db = await this.open();
    const k = key || this.keyOf(name, blob.size);
    return new Promise((res, rej) => {
      const tx = db.transaction(this.STORE, "readwrite");
      tx.objectStore(this.STORE).put({ key: k, name, size: blob.size, blob, t: Date.now() });
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

async function resizeImageBlob(file, maxDim = 1920, quality = 0.85) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const w0 = img.width, h0 = img.height;
      const ratio = Math.min(1, maxDim / Math.max(w0, h0));
      const tw = Math.max(1, Math.round(w0 * ratio));
      const th = Math.max(1, Math.round(h0 * ratio));
      // si ya es pequeña, evita recodificar
      if (ratio >= 1) { URL.revokeObjectURL(url); res(file); return; }
      const c = document.createElement("canvas");
      c.width = tw; c.height = th;
      c.getContext("2d", { alpha: false }).drawImage(img, 0, 0, tw, th);
      c.toBlob(b => {
        URL.revokeObjectURL(url);
        res(b || file);
      }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(file); };
    img.src = url;
  });
}

/* =========================================================================
 *  Persistencia local
 * ========================================================================= */
const store = {
  KEY: "abmedia_sequences_v3",
  load() { try { return JSON.parse(localStorage.getItem(this.KEY)) || null; } catch { return null; } },
  save(seqs) {
    const data = seqs.map(s => ({
      id: s.id, title: s.title, category: s.category, status: s.status,
      submitted: !!s.submitted, style: s.style,
      slides: s.slides.map(sl => ({ body: sl.body, pos: sl.pos, align: sl.align, overlay: sl.overlay, bg: sl.bg }))
    }));
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); } catch {}
  }
};
const storeIdeas = {
  KEY: "abmedia_ideas_v1",
  load() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
  save(items) { try { localStorage.setItem(this.KEY, JSON.stringify(items)); } catch {} }
};
const storeSched = {
  KEY: "abmedia_schedule_v1",
  load() { try { return JSON.parse(localStorage.getItem(this.KEY)) || null; } catch { return null; } },
  save(s) { try { localStorage.setItem(this.KEY, JSON.stringify(s)); } catch {} }
};
const storeT = {
  KEY: "abmedia_user_templates_v2",
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
function newStyle() { return JSON.parse(JSON.stringify(DEFAULT_STYLE)); }

function makeSlide(s) {
  return {
    body: s.body,
    overlay: s.overlay || "bottom",
    pos: s.pos || { x: 0.05, y: 0.085 },
    align: s.align || "left",
    bg: s.bg ? { ...s.bg } : { zoom: 1, ox: 0, oy: 0 },
    bgIndex: -1, inset: null, _textBox: null
  };
}
function instantiate(data) {
  const seq = {
    id: data.id || state.seq++,
    title: data.title || "Secuencia",
    category: data.category || "venta",
    status: data.status || "draft",
    submitted: !!data.submitted,
    style: data.style ? { ...newStyle(), ...data.style } : newStyle(),
    slides: (data.slides || []).map(makeSlide)
  };
  // scheduledDate vive en style (para persistir en DB via JSONB)
  if (seq.style.scheduledDate) seq.scheduledDate = seq.style.scheduledDate;
  if (data.id && data.id >= state.seq) state.seq = data.id + 1;
  assignRandomImages(seq);
  return seq;
}
function fromCatalog(catId, extra = {}) {
  const c = CATALOG.find(x => x.id === catId);
  return instantiate({ title: c.title, category: c.category, slides: c.slides, ...extra });
}
function fromStructure(frames, category) {
  const slides = Array.from({ length: frames }, (_, i) => ({ body: blankBody(i), overlay: "bottom" }));
  return instantiate({ title: "Nueva secuencia", category, slides, status: "draft" });
}
function fromTemplate(tpl, extra = {}) {
  return instantiate({ title: tpl.title, category: tpl.category, slides: tpl.slides, style: tpl.style, ...extra });
}
function assignRandomImages(seq) {
  const n = state.images.length;
  if (!n) { seq.slides.forEach(s => s.bgIndex = -1); return; }
  const pool = shuffle([...Array(n).keys()]);
  seq.slides.forEach((s, i) => { s.bgIndex = pool[i % pool.length]; });
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* =========================================================================
 *  Imágenes (subida + persistencia)
 * ========================================================================= */
async function loadFiles(fileList) {
  const files = Array.from(fileList)
    .filter(f => f.type.startsWith("image/") || esHeic(f));
  if (!files.length) return;
  let added = 0;
  const fallidas = [];
  for (const file of files) {
    // Key con el tamaño ORIGINAL — re-subir el mismo archivo siempre dedup
    const key = imgDB.keyOf(file.name, file.size);
    if (state.images.some(i => i.key === key)) continue;

    const original = await normalizarImagen(file);
    if (!original) { fallidas.push(file.name); continue; }

    // Resize a 1920px para no cargar JPEGs de 5MB en memoria
    let blob = original;
    try { blob = await resizeImageBlob(original, 1920); } catch {}
    try { await imgDB.put(file.name, blob, key); } catch (e) { console.warn("DB put", e); }
    try { subirFotoANube(key, file.name, blob); } catch {}
    await new Promise(res => {
      const img = new Image();
      img.onload = () => { state.images.push({ key, name: file.name, img }); added++; res(); };
      img.onerror = () => { fallidas.push(file.name); res(); };
      img.src = URL.createObjectURL(blob);
    });
  }
  if (fallidas.length) {
    aviso("No se han podido abrir: " + fallidas.join(", "), "error");
  }
  // Dedup defensivo final
  const uniq = new Map(); state.images.forEach(im => uniq.set(im.key, im));
  state.images = [...uniq.values()];
  updateImgCount();
  if (added > 0) {
    state.sequences.forEach(s => { if (s.slides.some(sl => sl.bgIndex < 0)) assignRandomImages(s); });
    renderAll();
    if (state.active) { assignRandomImages(state.active); drawEditor(); renderThumbs(); }
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
    if (!remotas.length) { await subirPendientes(); return; }

    const locales = new Set(state.images.map(i => i.key));
    const uid = state.user.id;
    let traidas = 0;
    for (const obj of remotas) {
      // el nombre del objeto contiene la clave original
      const key = decodeURIComponent(obj.name.replace(/\.jpg$/, "").replace(/_/g, "%"));
      if (locales.has(key)) continue;
      const blob = await sbFotos.sbDescargarFoto(obj.name);
      if (!blob) continue;
      const nombre = key.split("|")[0] || obj.name;
      try { await imgDB.put(nombre, blob, key); } catch {}
      const o = await blobToImage(blob, nombre);
      if (o) { o.key = key; state.images.push(o); traidas++; }
    }
    if (traidas) { updateImgCount(); if (state.view === "gallery") renderAll(); }
    await subirPendientes();
  } catch (e) {
    console.warn("sincronizarFotos", e);
  }
}

/* Las que están en este equipo pero todavía no en la nube. */
async function subirPendientes() {
  try {
    const remotas = await sbFotos.sbListarFotos();
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

async function loadImagesFromDB() {
  state.images = []; // limpia siempre: si bootLoggedIn se llama 2 veces no se duplica
  try {
    const rows = await imgDB.getAll();
    const seen = new Set();
    for (const r of rows) {
      const key = r.key || imgDB.keyOf(r.name, r.size || 0);
      if (seen.has(key)) continue;
      seen.add(key);
      const o = await blobToImage(r.blob, r.name);
      if (o) { o.key = key; state.images.push(o); }
    }
  } catch (e) { console.warn("loadImagesFromDB", e); }
  updateImgCount();
}
async function clearGallery() {
  if (!confirm("¿Vaciar toda la galería de imágenes?\n\nSe borrarán también de la nube, así que desaparecerán de todos tus dispositivos.")) return;
  await imgDB.clear();
  if (state.user && window.sbFotos) {
    try { await sbFotos.sbBorrarTodasLasFotos(); } catch (e) { console.warn("borrar nube", e); }
  }
  state.images = [];
  state.sequences.forEach(s => assignRandomImages(s));
  updateImgCount();
  renderAll();
}
async function deleteImage(index) {
  const im = state.images[index];
  if (im?.key) await imgDB.deleteByKey(im.key);
  if (im?.key && state.user && window.sbFotos) {
    try { await sbFotos.sbBorrarFoto(im.key); } catch (e) { console.warn("borrar foto nube", e); }
  }
  state.images.splice(index, 1);
  state.sequences.forEach(s => assignRandomImages(s));
  updateImgCount();
  renderAll();
}

/* =========================================================================
 *  Vistas
 * ========================================================================= */
function setView(view) {
  state.view = view;
  $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.view === view));
  $("#avisosTab").classList.toggle("activo", view === "avisos");
  ["library", "mias", "gallery", "desk", "calendar", "avisos", "admin"].forEach(v => $("#view-" + v).classList.toggle("hidden", v !== view));
  if (view === "avisos") renderAvisos();
  if (view === "mias") renderMias();
  if (view === "library") { state.libraryStage = "categories"; state.libraryCat = null; }
  renderAll();
}
function renderAll() {
  if (state.view === "library") renderLibrary();
  else if (state.view === "mias") renderMias();
  else if (state.view === "gallery") renderGallery();
  else if (state.view === "desk") renderIdeas();
  else if (state.view === "calendar") renderCalendar();
  else if (state.view === "admin") renderAdmin();
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
  $("#libBack").classList.toggle("hidden", state.libraryStage === "categories");
  if (state.libraryStage === "categories") {
    $("#libTitle").textContent = "Biblioteca de secuencias";
    $("#libSub").textContent = "Plantillas de ABMedia. Elige una categoría y adapta la que quieras.";
  } else {
    const cat = CATEGORIES[state.libraryCat];
    $("#libTitle").textContent = cat.name;
    $("#libSub").textContent = cat.desc;
  }
  $$(".lib-filter .seg").forEach(s => s.classList.toggle("active", s.dataset.libfilter === state.libraryFilter));
  if (state.libraryStage === "categories") {
    $("#catTiles").classList.remove("hidden");
    $("#catalogGrid").classList.add("hidden");
    renderCatTiles();
  } else {
    $("#catTiles").classList.add("hidden");
    $("#catalogGrid").classList.remove("hidden");
    renderCatalogList();
  }
}

function renderCatTiles() {
  const box = $("#catTiles"); box.innerHTML = "";
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const items = getCategoryItems(key);
    const tile = document.createElement("button");
    tile.className = "cat-tile";
    // Sin icono: el nombre y la explicación mandan
    tile.innerHTML = `
      <span class="count">${items.length}</span>
      <h3>${cat.name}</h3>
      <p>${cat.desc}</p>`;
    tile.addEventListener("click", () => {
      state.libraryStage = "list"; state.libraryCat = key; renderLibrary();
    });
    box.appendChild(tile);
  });
}

function renderCatalogList() {
  const grid = $("#catalogGrid"); grid.innerHTML = "";
  const items = getCategoryItems(state.libraryCat);
  if (!items.length) {
    grid.innerHTML = `<p class="empty">${state.libraryFilter === "mine"
      ? "Todavía no tienes plantillas propias en esta categoría. Abre una secuencia y pulsa \"Guardar como plantilla\"."
      : "No hay secuencias en esta categoría."}</p>`;
    return;
  }
  items.forEach(item => grid.appendChild(makeLibCard(item)));
}

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
  const filtro = state.miasFiltro || "todas";
  $$("#miasFiltro .seg").forEach(b => b.classList.toggle("active", b.dataset.estado === filtro));

  const todas = state.sequences || [];
  const lista = filtro === "todas" ? todas : todas.filter(s => estadoDe(s) === filtro);
  $("#miasCount").textContent = `${todas.length} ${todas.length === 1 ? "secuencia" : "secuencias"}`;

  grid.innerHTML = "";
  if (!lista.length) {
    grid.innerHTML = `<p class="empty">${
      filtro === "todas"
        ? "Todavía no has guardado ninguna. Coge una de la biblioteca o crea una nueva y pulsa Guardar."
        : "No tienes ninguna secuencia en este estado."}</p>`;
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
       <span class="cat-tag">${cat.name}</span>
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
  box.querySelector('[data-act="del"]').addEventListener("click", async e => {
    e.stopPropagation();
    if (state.user && seq.cloudId) await sbDB.sbDeleteSequence(seq.cloudId);
    removeScheduleEntriesForSeq(seq.id);
    storeSched.save(state.schedule);
    state.sequences = state.sequences.filter(x => x.id !== seq.id);
    store.save(state.sequences);
    renderMias();
  });

  card.appendChild(box);
  card.addEventListener("click", () => openEditor(seq.id));
  return card;
}

function makeLibCard(item) {
  const seq = item.isUser ? fromTemplate(item) : fromCatalog(item.id);
  const cat = CATEGORIES[item.category] || CATEGORIES.venta;
  const card = document.createElement("div"); card.className = "card";
  card.appendChild(makeCardCanvas(seq.slides[0], seq.style));
  const badge = document.createElement("span");
  badge.className = "frames-badge"; badge.textContent = `${seq.slides.length} frames`;
  card.appendChild(badge);
  const info = document.createElement("div"); info.className = "card-info";
  info.innerHTML = `<div class="card-row"><h3>${item.title}</h3>
      <span class="cat-tag">${cat.name}</span></div>
      ${item.objective ? `<p class="card-obj">${item.objective}</p>` : ""}
      <div class="card-acciones">
        <button class="btn btn-primary sm card-cta" data-act="use">Usar esta secuencia →</button>
        ${item.isUser ? `<button class="card-borrar" data-act="del" title="Borrar" aria-label="Borrar">
            <svg viewBox="0 0 24 24"><path d="M4 7 H20 M9 7 V5 a1 1 0 0 1 1 -1 h4 a1 1 0 0 1 1 1 v2 M6.5 7 L7.5 20 a1 1 0 0 0 1 1 h7 a1 1 0 0 0 1 -1 L18 7"/></svg>
          </button>` : ""}
      </div>`;
  info.querySelector('[data-act="use"]').addEventListener("click", (e) => {
    e.stopPropagation();
    const created = item.isUser
      ? fromTemplate(item, { status: "draft" })
      : fromCatalog(item.id, { status: "draft" });
    state.sequences.unshift(created); persist(); openEditor(created.id);
  });
  if (item.isUser) info.querySelector('[data-act="del"]').addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm("¿Borrar esta plantilla?")) return;
    if (state.user && item.cloudId) await sbDB.sbDeleteTemplate(item.cloudId);
    state.userTemplates = state.userTemplates.filter(t => t.id !== item.id);
    storeT.save(state.userTemplates); renderLibrary();
  });
  card.appendChild(info);
  return card;
}

/* ---------------------------------------------------------------------- *
 *  GALERÍA
 * ---------------------------------------------------------------------- */
function renderGallery() {
  updateImgCount();
  const grid = $("#galleryGrid"); grid.innerHTML = "";
  if (!state.images.length) {
    grid.innerHTML = `<p class="empty">Aún no has cargado imágenes. Pulsa el botón de arriba para elegir tu carpeta.</p>`;
    return;
  }
  state.images.forEach((im, i) => {
    const cell = document.createElement("div"); cell.className = "gallery-cell";
    const img = document.createElement("img"); img.src = im.img.src;
    const name = document.createElement("div"); name.className = "name"; name.textContent = im.name;
    const x = document.createElement("button"); x.className = "x"; x.textContent = "✕"; x.title = "Eliminar";
    x.addEventListener("click", e => { e.stopPropagation(); deleteImage(i); });
    cell.appendChild(img); cell.appendChild(name); cell.appendChild(x);
    grid.appendChild(cell);
  });
}

/* ---------------------------------------------------------------------- *
 *  IDEAS (tipo tabla)
 * ---------------------------------------------------------------------- */
function renderIdeas() {
  const box = $("#inboxList");
  box.innerHTML = "";
  if (!state.inbox.length) {
    box.innerHTML = `<p class="empty">Aún no tienes ideas. Añade la primera con el formulario de arriba.</p>`;
    return;
  }
  state.inbox.forEach((item, i) => {
    const cat = CATEGORIES[item.category] || CATEGORIES.venta;
    const row = document.createElement("div");
    row.className = "idea-row";
    row.innerHTML = `
      <div class="txt" title="${escapeAttr(item.brief)}">${escapeHtml(item.brief)}</div>
      <span class="cat-pill">${cat.name}</span>
      <button class="btn btn-primary" data-act="use">Convertir</button>
      <button class="icon-btn" data-act="del" title="Eliminar">🗑</button>`;
    row.querySelector('[data-act="use"]').addEventListener("click", () => {
      const seq = fromStructure(3, item.category);
      seq.title = item.brief.length > 46 ? item.brief.slice(0, 46) + "…" : item.brief;
      state.sequences.unshift(seq);
      state.inbox.splice(i, 1); storeIdeas.save(state.inbox);
      persist(); renderAll(); openEditor(seq.id);
    });
    row.querySelector('[data-act="del"]').addEventListener("click", () => {
      state.inbox.splice(i, 1); storeIdeas.save(state.inbox); renderIdeas();
    });
    box.appendChild(row);
  });
}
function addIdea() {
  const input = $("#ideaInput");
  const txt = input.value.trim();
  if (!txt) return;
  const cat = $("#ideaCat").value;
  state.inbox.unshift({ brief: txt, category: cat });
  storeIdeas.save(state.inbox);
  input.value = "";
  renderIdeas();
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
const CAL_CAT_ORDER = ["personal", "venta", "puente", "flex", "valor"];

function ensureScheduleFor(monthDate) {
  // Si ya hay schedule (aunque esté vacío tras un borrado manual), lo respeta.
  // Si no, asigna 3 secuencias/semana (Mon/Wed/Fri) como base de ejemplo,
  // rotando entre las 5 categorías del catálogo. Persistente por mes.
  // Las entradas pueden ser:
  //   "catalog-id"   → sugerencia desde catálogo
  //   "seq:<id>"     → secuencia del usuario programada en ese día
  const key = ymKey(monthDate);
  if (state.schedule[key]) return;
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const byCat = {};
  CAL_CAT_ORDER.forEach(k => { byCat[k] = CATALOG.filter(t => t.category === k); });
  // Cada mes empieza rotando por una categoría distinta, para que con el
  // tiempo se vean ejemplos de las cinco.
  let catIdx = (year * 12 + month) % CAL_CAT_ORDER.length;
  const map = {};
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 1 || dow === 3 || dow === 5) {
      const cat = CAL_CAT_ORDER[catIdx % CAL_CAT_ORDER.length];
      const list = byCat[cat];
      if (list && list.length) {
        const dayOfYear = Math.floor((d - new Date(year, 0, 0)) / 86400000);
        map[fmtDate(d)] = [list[dayOfYear % list.length].id];
      }
      catIdx++;
    }
  }
  state.schedule[key] = map;
  storeSched.save(state.schedule);
}

/* ---------------------------------------------------------------------- *
 *  BORRADO MASIVO DE PROGRAMACIONES
 * ---------------------------------------------------------------------- */
function clearAllSchedule() {
  if (!confirm("¿Borrar TODAS las programaciones del calendario? Esta acción no se puede deshacer.")) return;
  Object.keys(state.schedule).forEach(k => { state.schedule[k] = {}; });
  storeSched.save(state.schedule);
  renderCalendar();
}

function clearMonthSchedule() {
  if (!state.calMonth) state.calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const label = `${MONTHS_ES[state.calMonth.getMonth()]} ${state.calMonth.getFullYear()}`;
  if (!confirm(`¿Borrar todas las programaciones de ${label}?`)) return;
  state.schedule[ymKey(state.calMonth)] = {};
  storeSched.save(state.schedule);
  renderCalendar();
}

function clearRangeSchedule() {
  const fromInp = $("#calRangeFrom"), toInp = $("#calRangeTo");
  let from = fromInp?.value, to = toInp?.value;
  if (!from || !to) { alert("Elige una fecha de inicio y una de fin."); return; }
  if (from > to) { const t = from; from = to; to = t; }
  if (!confirm(`¿Borrar las programaciones entre ${from} y ${to}?`)) return;
  Object.keys(state.schedule).forEach(ym => {
    const map = state.schedule[ym];
    Object.keys(map).forEach(day => {
      if (day >= from && day <= to) delete map[day];
    });
  });
  storeSched.save(state.schedule);
  renderCalendar();
}

/* Un día puede tener varias secuencias. Históricamente guardábamos un solo
   valor por día, así que al leer se normaliza a lista y al escribir siempre
   se guarda lista: los calendarios antiguos siguen funcionando. */
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
  const tag = "seq:" + seqId;
  const dias = [];
  for (const ym in state.schedule) {
    const map = state.schedule[ym];
    for (const d in map) if (calList(map, d).includes(tag)) dias.push(d);
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
  persist();
}

function calPush(map, key, entry) {
  const l = calList(map, key);
  l.push(entry);
  calSet(map, key, l);
}

// Devuelve { title, category, isUserSeq, ref }  donde ref es seq-id o catalog-id
function resolveCalEntry(entry) {
  if (typeof entry === "string" && entry.startsWith("seq:")) {
    const id = parseInt(entry.slice(4));
    const seq = state.sequences.find(s => s.id === id);
    if (!seq) return null;
    return { title: seq.title, category: seq.category, isUserSeq: true, ref: id };
  }
  const c = CATALOG.find(x => x.id === entry);
  if (!c) return null;
  return { title: c.title, category: c.category, isUserSeq: false, ref: c.id };
}

// Quita todas las referencias 'seq:<id>' del schedule
function removeScheduleEntriesForSeq(seqId) {
  const tag = "seq:" + seqId;
  for (const ym in state.schedule) {
    const map = state.schedule[ym];
    for (const d in map) {
      calSet(map, d, calList(map, d).filter(e => e !== tag));
    }
  }
}

function setScheduleForSequence(seq, date) {
  removeScheduleEntriesForSeq(seq.id);
  seq.style.scheduledDate = date || undefined; // persiste en DB vía JSONB
  if (date) {
    const ym = date.slice(0, 7);
    state.schedule[ym] = state.schedule[ym] || {};
    calPush(state.schedule[ym], date, "seq:" + seq.id);
  }
  storeSched.save(state.schedule);
  if (state.view === "calendar") renderCalendar();
}

// Reconstruye entradas del calendario para secuencias con scheduledDate al iniciar
function rebuildScheduleFromSequences() {
  state.sequences.forEach(s => {
    if (s.scheduledDate) {
      const ym = s.scheduledDate.slice(0,7);
      state.schedule[ym] = state.schedule[ym] || {};
      // Se añade a lo que ya hubiera ese día, sin pisarlo
      const tag = "seq:" + s.id;
      if (!calList(state.schedule[ym], s.scheduledDate).includes(tag)) {
        calPush(state.schedule[ym], s.scheduledDate, tag);
      }
    }
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
        `<span class="ct">${cat.name}${r.isUserSeq ? " · tuya" : ""}</span>` +
        `<span class="sq-t">${escapeHtml(r.title)}</span>` +
        `<button class="sq-x" title="Quitar de este día">✕</button>`;

      seqEl.querySelector(".sq-x").addEventListener("click", e => {
        e.stopPropagation();
        const cur = calList(map, key);
        cur.splice(idx, 1);
        calSet(map, key, cur);
        if (typeof entry === "string" && entry.startsWith("seq:")) {
          sincronizarFechaSecuencia(parseInt(entry.slice(4)));
        }
        storeSched.save(state.schedule);
        renderCalendar();
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
        sincronizarFechaSecuencia(parseInt(movida.slice(4)));
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
  $("#seqPeekCat").textContent = cat.name + (r.isUserSeq ? " · tuya" : " · del catálogo");

  const [y, mo, d] = key.split("-");
  const fecha = new Date(+y, +mo - 1, +d);
  $("#seqPeekWhen").textContent =
    `${DOW_LARGO[(fecha.getDay() + 6) % 7]} ${fecha.getDate()} de ${MONTHS_ES[fecha.getMonth()]}`;

  // Se monta una copia solo para pintar; no entra en el estado de la app
  const seq = r.isUserSeq
    ? state.sequences.find(x => x.id === r.ref)
    : fromCatalog(r.ref, { id: -1 });

  const cont = $("#seqPeekFrames");
  cont.innerHTML = "";
  (seq ? seq.slides : []).forEach((slide, i) => {
    const fr = document.createElement("div");
    fr.className = "peek-frame";
    fr.appendChild(makeCardCanvas(slide, seq.style, 150, 267));
    const n = document.createElement("span");
    n.className = "peek-n";
    n.textContent = `Frame ${i + 1}`;
    fr.appendChild(n);
    cont.appendChild(fr);
  });
  if (!cont.children.length) {
    cont.innerHTML = `<p class="empty">Esta secuencia todavía no tiene frames.</p>`;
  }

  $("#seqPeekModal").classList.remove("hidden");
}

function closeSeqPeek() {
  $("#seqPeekModal").classList.add("hidden");
  _peek = null;
}

// Abre de verdad: si es del catálogo, primero se hace tuya
function peekOpenInEditor() {
  if (!_peek) return;
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
  cur[idx] = "seq:" + created.id;
  calSet(map, key, cur);
  storeSched.save(state.schedule);
  persist();
  openEditor(created.id);
}

function peekRemoveFromDay() {
  if (!_peek) return;
  const { entry, key, idx } = _peek;
  const map = state.schedule[key.slice(0, 7)];
  if (map) {
    const cur = calList(map, key);
    cur.splice(idx, 1);
    calSet(map, key, cur);
    if (typeof entry === "string" && entry.startsWith("seq:")) {
      sincronizarFechaSecuencia(parseInt(entry.slice(4)));
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
    entry: "seq:" + s.id, title: s.title, category: s.category, mine: true
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
      calPush(state.schedule[ym], _calPickKey, x.entry);
      if (x.mine) sincronizarFechaSecuencia(parseInt(x.entry.slice(4)));
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

/* ---------------------------------------------------------------------- *
 *  ADMIN
 * ---------------------------------------------------------------------- */
async function renderAdmin() {
  const grid = $("#adminGrid"); grid.innerHTML = `<p class="empty">Cargando…</p>`;
  const items = await sbDB.sbFetchTemplates("review");
  grid.innerHTML = "";
  if (!items.length) { grid.innerHTML = `<p class="empty">No hay plantillas pendientes.</p>`; return; }
  items.forEach(row => {
    const tpl = { id: "r" + row.id, cloudId: row.id, title: row.title, category: row.category, style: row.style, slides: row.slides };
    const seq = fromTemplate(tpl);
    const cat = CATEGORIES[tpl.category] || CATEGORIES.venta;
    const card = document.createElement("div"); card.className = "card";
    card.appendChild(makeCardCanvas(seq.slides[0], seq.style));
    const badge = document.createElement("span"); badge.className = "frames-badge"; badge.textContent = `${seq.slides.length} frames`;
    card.appendChild(badge);
    const info = document.createElement("div"); info.className = "card-info";
    info.innerHTML = `<div class="card-row"><h3>${tpl.title}</h3>
        <span class="cat-tag">${cat.name}</span></div>
        <p class="card-obj">Enviada para revisión</p>
        <button class="btn btn-primary sm full" data-act="approve">✅ Aprobar y publicar</button>`;
    info.querySelector('[data-act="approve"]').addEventListener("click", async () => {
      await sbDB.sbApproveTemplate(row.id);
      renderAdmin();
    });
    card.appendChild(info); grid.appendChild(card);
  });
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
  $("#highlightColor").value = st.highlightColor;
  $("#textColor").value = st.textColor;
  $("#sizeRange").value = String(st.size);
  updateColorDots();
  syncFontChips();
}
function updateColorDots() {
  const st = state.active?.style; if (!st) return;
  const t = $("#textColorDot"); if (t) t.style.background = st.textColor;
  const h = $("#highlightColorDot"); if (h) h.style.background = st.highlightColor;
}
function syncFontChips() {
  const box = $("#fontChips"); if (!box) return;
  $$(".font-chip").forEach(c => c.classList.toggle("active", c.dataset.fontval === state.active.style.font));
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
    cv.width = 90; cv.height = 160;
    drawSlide(cv.getContext("2d"), slide, cv.width, cv.height, state.active.style);
    t.appendChild(cv);
    const span = document.createElement("span"); span.textContent = "Frame " + (i + 1);
    t.appendChild(span);
    t.addEventListener("click", () => { state.current = i; renderThumbs(); drawEditor(); });
    box.appendChild(t);
  });
  const add = document.createElement("button");
  add.className = "thumb add"; add.innerHTML = "<span>＋</span>";
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
  syncOverlayChips();
  $("#bgZoom").value = slide.bg.zoom;
  $("#insetControls").classList.toggle("hidden", !slide.inset);
  renderBgPicker();
}
function renderBgPicker() {
  const box = $("#bgPicker"); if (!box) return;
  box.innerHTML = "";
  if (!state.images.length) { box.innerHTML = `<span class="bg-empty">Sube fotos en "Galería" para elegir el fondo.</span>`; return; }
  state.images.forEach((im, i) => {
    const t = document.createElement("button");
    t.className = "bg-thumb" + (i === curSlide().bgIndex ? " active" : "");
    const cv = document.createElement("canvas"); cv.width = 54; cv.height = 96;
    drawCover(cv.getContext("2d"), im.img, 54, 96, { zoom: 1, ox: 0, oy: 0 });
    t.appendChild(cv);
    t.addEventListener("click", () => { curSlide().bgIndex = i; curSlide().bg = { zoom: 1, ox: 0, oy: 0 }; drawEditor(); refreshActiveThumb(); persist(); });
    box.appendChild(t);
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
  const scale = w / CANVAS_W;
  c.clearRect(0, 0, w, h);
  const imgObj = slide.bgIndex >= 0 ? state.images[slide.bgIndex] : null;
  if (imgObj) drawCover(c, imgObj.img, w, h, slide.bg); else drawPlaceholder(c, w, h);
  drawOverlay(c, slide.overlay, w, h);
  if (slide.inset && slide.inset.img) drawInset(c, slide.inset, w, h);
  drawBody(c, slide, style, scale, w, h);
  if (guides) drawGuides(c, w, h);
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
  c.fillStyle = "rgba(255,255,255,0.55)";
  c.font = `600 ${w * 0.026}px -apple-system, system-ui, sans-serif`;
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("zona segura", w / 2, ty + w * 0.03);
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
function layoutBody(c, slide, style, scale, w, h) {
  const text = (slide.body || "").trim();
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
    lines.forEach(l => { blockW = Math.max(blockW, l.width); });
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
  layout.forEach(block => {
    if (block.gap) { y += parGap; return; }
    block.lines.forEach(ln => {
      for (let i = 0; i < ln.words.length;) {
        if (ln.words[i].hl) {
          let j = i, sX = ln.words[i].x, eX = ln.words[i].x + ln.words[i].w;
          while (j < ln.words.length && ln.words[j].hl) { eX = ln.words[j].x + ln.words[j].w; j++; }
          const padX = size * 0.16, padY = size * 0.13;
          c.fillStyle = style.highlightColor;
          roundRect(c, left + sX - padX, y - size + size * 0.06 - padY, (eX - sX) + padX * 2, size + padY * 1.4, size * 0.18);
          c.fill();
          i = j;
        } else i++;
      }
      ln.words.forEach(t => {
        c.fillStyle = t.hl ? style.highlightText : (t.ac ? style.highlightColor : style.textColor);
        if (!t.hl) { c.shadowColor = "rgba(0,0,0,0.5)"; c.shadowBlur = size * 0.12; c.shadowOffsetY = size * 0.025; }
        c.fillText(t.text, left + t.x, y);
        c.shadowColor = "transparent"; c.shadowBlur = 0; c.shadowOffsetY = 0;
      });
      for (let k = 0; k < ln.words.length;) {
        if (ln.words[k].ul) {
          let j = k, sX = ln.words[k].x, eX = ln.words[k].x + ln.words[k].w;
          while (j < ln.words.length && ln.words[j].ul) { eX = ln.words[j].x + ln.words[j].w; j++; }
          c.strokeStyle = style.highlightColor; c.lineWidth = size * 0.07; c.lineCap = "round";
          const uy = y + size * 0.17;
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
  const copy = makeSlide({ body: s.body, pos: { ...s.pos }, align: s.align, overlay: s.overlay, bg: { ...s.bg } });
  copy.bgIndex = s.bgIndex; copy.inset = s.inset ? { ...s.inset } : null;
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
    slides: s.slides.map(sl => ({ body: sl.body, pos: { ...sl.pos }, align: sl.align, overlay: sl.overlay })),
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
     </div>` +
    (f.review_note
      ? `<p class="aviso-nota">${escapeHtml(f.review_note).replace(/\n/g, "<br>")}</p>`
      : "");
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
function wrapSelection(marker) {
  const ta = $("#bodyInput");
  const s = ta.selectionStart, e = ta.selectionEnd;
  if (s === e) return;
  const val = ta.value;
  ta.value = val.slice(0, s) + marker + val.slice(s, e) + marker + val.slice(e);
  curSlide().body = ta.value;
  drawEditor(); refreshActiveThumb();
  ta.focus(); ta.setSelectionRange(s, e + marker.length * 2);
}

/* =========================================================================
 *  TOUR
 * ========================================================================= */
const TOUR_KEY = "abmedia_tour_done_v3";
const TOUR_STEPS = [
  { view: "library", sel: '[data-tour="library"]', title: "Biblioteca",
    body: "Aquí están todas las secuencias preestablecidas y las tuyas. Filtra entre 'Todas' o 'Mis secuencias' y entra en una categoría (Personal, Venta o Puente) para verlas." },
  { view: "gallery", sel: '[data-tour="gallery"]', title: "Galería de imágenes",
    body: "Sube tu carpeta de fotos. Se quedan guardadas en tu navegador y se usan como fondo de las stories. Puedes vaciarlas o eliminar imágenes una a una." },
  { view: "desk", sel: '[data-tour="desk"]', title: "Ideas de stories",
    body: "Tu cuaderno de inspiración. Anota ideas con su categoría y conviértelas en secuencias en un clic." },
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

  $$(".lib-filter .seg").forEach(s => s.addEventListener("click", () => {
    state.libraryFilter = s.dataset.libfilter; renderLibrary();
  }));
  $("#libBack").addEventListener("click", () => {
    state.libraryStage = "categories"; state.libraryCat = null; renderLibrary();
  });

  // Galería
  const gDrop = $("#galleryDrop");
  gDrop.addEventListener("click", () => $("#galleryInput").click());
  $("#galleryPickBtn").addEventListener("click", e => { e.stopPropagation(); $("#galleryInput").click(); });
  $("#galleryClearBtn").addEventListener("click", e => { e.stopPropagation(); clearGallery(); });
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
  $("#addIdeaBtn").addEventListener("click", addIdea);
  $("#ideaInput").addEventListener("keydown", e => { if (e.key === "Enter") addIdea(); });

  // Calendar
  $("#calPrev").addEventListener("click", () => calMove(-1));
  $("#calNext").addEventListener("click", () => calMove(1));
  $("#calClearAll").addEventListener("click", clearAllSchedule);
  $("#calClearMonth").addEventListener("click", clearMonthSchedule);
  $("#calClearRange").addEventListener("click", clearRangeSchedule);

  // Elegir qué secuencia se añade a un día concreto
  $("#seqPeekClose").addEventListener("click", closeSeqPeek);
  $("#seqPeekOpen").addEventListener("click", peekOpenInEditor);
  $("#seqPeekRemove").addEventListener("click", peekRemoveFromDay);
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
  $("#bodyInput").addEventListener("input", e => { curSlide().body = e.target.value; drawEditor(); refreshActiveThumb(); });
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
  $("#highlightColor").addEventListener("input", e => { state.active.style.highlightColor = e.target.value; updateColorDots(); drawEditor(); renderThumbs(); persist(); });
  $("#textColor").addEventListener("input", e => { state.active.style.textColor = e.target.value; updateColorDots(); drawEditor(); renderThumbs(); persist(); });
  $("#sizeRange").addEventListener("input", e => { state.active.style.size = parseFloat(e.target.value); drawEditor(); refreshActiveThumb(); });
  $("#sizeRange").addEventListener("change", persist);
  $("#shuffleAll").addEventListener("click", () => { assignRandomImages(state.active); drawEditor(); renderThumbs(); });
  $("#newImg").addEventListener("click", () => {
    const n = state.images.length; if (n <= 1) return;
    const slide = curSlide(); let next; do { next = Math.floor(Math.random() * n); } while (next === slide.bgIndex);
    slide.bgIndex = next; drawEditor(); refreshActiveThumb();
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
  $$("#miasFiltro .seg").forEach(b => b.addEventListener("click", () => {
    state.miasFiltro = b.dataset.estado; renderMias();
  }));

  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#overlay").classList.contains("hidden")) closeEditor(); });
  window.addEventListener("resize", () => { if (!$("#tour").classList.contains("hidden")) positionTourSpot(TOUR_STEPS[tourIdx]?.sel); });
}

/* =========================================================================
 *  Fuentes (chips visuales)
 * ========================================================================= */
function buildFontChips() {
  const box = $("#fontChips"); if (!box) return;
  box.innerHTML = "";
  FONTS.forEach(f => {
    const b = document.createElement("button");
    b.className = "font-chip";
    b.dataset.fontval = f.value;
    b.style.fontFamily = f.value;
    b.textContent = f.name;
    b.addEventListener("click", () => {
      state.active.style.font = f.value;
      syncFontChips();
      drawEditor(); renderThumbs(); persist();
    });
    box.appendChild(b);
  });
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

  // Cada cuenta tiene su propia galería en este navegador
  imgDB.usarCuenta(user.id);
  // Pide al navegador que no borre las fotos si va justo de espacio
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch {}
  await migrarGaleriaAntigua();

  // Primero lo que ya está en este equipo, para pintar cuanto antes
  await loadImagesFromDB();
  // y después se completa con lo que haya en la nube
  sincronizarFotos();

  const cloudSeqs = await sbDB.sbFetchSequences();
  if (cloudSeqs.length) {
    state.sequences = cloudSeqs.map(r => {
      const seq = instantiate({ title: r.title, category: r.category, status: r.status, submitted: r.submitted, style: r.style, slides: r.slides });
      seq.cloudId = r.id;
      return seq;
    });
  } else {
    state.sequences = [];
  }
  const cloudTpls = await sbDB.sbFetchTemplates("mine");
  state.userTemplates = cloudTpls.map(r => ({ id: "u" + r.id, cloudId: r.id, title: r.title, category: r.category, style: r.style, slides: r.slides, submitted: r.submitted, isUser: true }));

  state.inbox = storeIdeas.load();
  state.schedule = storeSched.load() || {};
  state.calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  rebuildScheduleFromSequences();

  setView("library");
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

async function init() {
  fillFontSelect();
  bind();
  bindLogin();

  sb.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) await bootOnce(session.user);
    else { state.user = null; _bootingFor = null; showLogin(); }
  });

  const s = await sbAuth.sbGetSession();
  if (s) await bootOnce(s.user);
  else showLogin();
}
document.addEventListener("DOMContentLoaded", init);
