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
  draft:     { label: "Borrador",    cls: "st-draft" },
  progress:  { label: "En progreso", cls: "st-progress" },
  scheduled: { label: "Programado",  cls: "st-scheduled" },
  published: { label: "Publicado",   cls: "st-published" }
};

/* =========================================================================
 *  IndexedDB para imágenes (persistente entre sesiones)
 * ========================================================================= */
const imgDB = {
  DB_NAME: "abmedia_images_v1",
  STORE: "files",
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE)) {
          db.createObjectStore(this.STORE, { autoIncrement: true });
        }
      };
      req.onsuccess = () => { this._db = req.result; res(req.result); };
      req.onerror = () => rej(req.error);
    });
  },
  async put(name, blob) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction(this.STORE, "readwrite");
      tx.objectStore(this.STORE).add({ name, blob, t: Date.now() });
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
  async deleteAt(index) {
    // Borra por posición (re-lee, filtra, re-graba)
    const all = await this.getAll();
    if (index < 0 || index >= all.length) return;
    const keep = all.filter((_, i) => i !== index);
    await this.clear();
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction(this.STORE, "readwrite");
      const store = tx.objectStore(this.STORE);
      keep.forEach(r => store.add(r));
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
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

const persist = () => {
  store.save(state.sequences);
  if (state.user && state.active) {
    sbDB.sbUpsertSequence(state.active).then(row => {
      if (row && !state.active.cloudId) state.active.cloudId = row.id;
    });
  }
};

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
  const files = Array.from(fileList).filter(f => f.type.startsWith("image/"));
  if (!files.length) return;
  for (const file of files) {
    try { await imgDB.put(file.name, file); } catch (e) { console.warn("DB put", e); }
    await new Promise(res => {
      const img = new Image();
      img.onload = () => { state.images.push({ name: file.name, img }); res(); };
      img.onerror = () => res();
      img.src = URL.createObjectURL(file);
    });
  }
  updateImgCount();
  state.sequences.forEach(s => { if (s.slides.some(sl => sl.bgIndex < 0)) assignRandomImages(s); });
  renderAll();
  if (state.active) { assignRandomImages(state.active); drawEditor(); renderThumbs(); }
}
function updateImgCount() {
  const n = state.images.length;
  const el = $("#galCount"); if (el) el.textContent = `${n} ${n === 1 ? "imagen" : "imágenes"}`;
}
async function loadImagesFromDB() {
  try {
    const rows = await imgDB.getAll();
    for (const r of rows) {
      const o = await blobToImage(r.blob, r.name);
      if (o) state.images.push(o);
    }
  } catch (e) { console.warn("loadImagesFromDB", e); }
  updateImgCount();
}
async function clearGallery() {
  if (!confirm("¿Vaciar toda la galería de imágenes?")) return;
  await imgDB.clear();
  state.images = [];
  state.sequences.forEach(s => assignRandomImages(s));
  updateImgCount();
  renderAll();
}
async function deleteImage(index) {
  await imgDB.deleteAt(index);
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
  ["library", "gallery", "desk", "calendar", "admin"].forEach(v => $("#view-" + v).classList.toggle("hidden", v !== view));
  if (view === "library") { state.libraryStage = "categories"; state.libraryCat = null; }
  renderAll();
}
function renderAll() {
  if (state.view === "library") renderLibrary();
  else if (state.view === "gallery") renderGallery();
  else if (state.view === "desk") renderIdeas();
  else if (state.view === "calendar") renderCalendar();
  else if (state.view === "admin") renderAdmin();
}

/* ---------------------------------------------------------------------- *
 *  BIBLIOTECA
 * ---------------------------------------------------------------------- */
function getCategoryItems(catKey) {
  const fromCatalogList = CATALOG.map(c => ({ ...c, isUser: false }));
  const fromUser = state.userTemplates.map(t => ({
    id: t.id, cloudId: t.cloudId, title: t.title, category: t.category,
    slides: t.slides, style: t.style, isUser: true
  }));
  const all = [...fromCatalogList, ...fromUser];
  return all.filter(it => {
    if (catKey && it.category !== catKey) return false;
    if (state.libraryFilter === "mine" && !it.isUser) return false;
    return true;
  });
}

function renderLibrary() {
  $("#libBack").classList.toggle("hidden", state.libraryStage === "categories");
  if (state.libraryStage === "categories") {
    $("#libTitle").textContent = "Biblioteca de secuencias";
    $("#libSub").textContent = state.libraryFilter === "mine"
      ? "Tus secuencias guardadas, organizadas por categoría."
      : "Elige una categoría para ver sus secuencias.";
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
    tile.innerHTML = `
      <span class="count">${items.length} ${items.length === 1 ? "secuencia" : "secuencias"}</span>
      <div class="icon">${cat.icon}</div>
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

function makeLibCard(item) {
  const seq = item.isUser ? fromTemplate(item) : fromCatalog(item.id);
  const cat = CATEGORIES[item.category] || CATEGORIES.venta;
  const card = document.createElement("div"); card.className = "card";
  const cv = document.createElement("canvas");
  cv.width = 270; cv.height = 480; cv.className = "card-canvas";
  drawSlide(cv.getContext("2d"), seq.slides[0], cv.width, cv.height, seq.style);
  card.appendChild(cv);
  const badge = document.createElement("span");
  badge.className = "frames-badge"; badge.textContent = `${seq.slides.length} frames`;
  card.appendChild(badge);
  const info = document.createElement("div"); info.className = "card-info";
  info.innerHTML = `<div class="card-row"><h3>${item.title}</h3>
      <span class="cat-tag">${cat.name}</span></div>
      ${item.objective ? `<p class="card-obj">${item.objective}</p>` : ""}
      <button class="btn btn-primary sm full" data-act="use">Usar esta secuencia →</button>
      ${item.isUser ? `<button class="btn btn-ghost xs full danger" data-act="del">🗑 Borrar plantilla</button>` : ""}`;
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
function fmtDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function ymKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }

function ensureScheduleFor(monthDate) {
  // Si ya hay schedule, lo respeta. Si no, asigna 3 secuencias/semana (Mon/Wed/Fri)
  // rotando por CATALOG. Persistente por mes.
  const key = ymKey(monthDate);
  if (state.schedule[key]) return;
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  // semilla determinista para que cada mes sea consistente
  let idx = ((year * 12 + month) * 3) % CATALOG.length;
  const map = {};
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay(); // 0=Sun
    if (dow === 1 || dow === 3 || dow === 5) {
      map[fmtDate(d)] = CATALOG[idx % CATALOG.length].id;
      idx++;
    }
  }
  state.schedule[key] = map;
  storeSched.save(state.schedule);
}

function renderCalendar() {
  if (!state.calMonth) state.calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  ensureScheduleFor(state.calMonth);
  const m = state.calMonth;
  $("#calLabel").textContent = `${MONTHS_ES[m.getMonth()]} ${m.getFullYear()}`;
  const map = state.schedule[ymKey(m)] || {};
  const grid = $("#calGrid"); grid.innerHTML = "";
  // Cabecera (L-D)
  DOW_ES.forEach(d => {
    const h = document.createElement("div"); h.className = "cal-head"; h.textContent = d; grid.appendChild(h);
  });
  // padding inicial (Lunes = 1; si día 1 cae en domingo (0) -> 6 huecos)
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
    const dn = document.createElement("div"); dn.className = "dnum"; dn.textContent = day; cell.appendChild(dn);
    const catId = map[key];
    if (catId) {
      const c = CATALOG.find(x => x.id === catId);
      if (c) {
        const cat = CATEGORIES[c.category] || CATEGORIES.venta;
        const seqEl = document.createElement("div");
        seqEl.className = "seq";
        seqEl.innerHTML = `<span class="ct">${cat.name}</span>${c.title}`;
        seqEl.addEventListener("click", () => {
          const created = fromCatalog(c.id, { status: "scheduled" });
          state.sequences.unshift(created); persist(); openEditor(created.id);
        });
        cell.appendChild(seqEl);
      }
    }
    grid.appendChild(cell);
  }
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
    const cv = document.createElement("canvas"); cv.width = 270; cv.height = 480; cv.className = "card-canvas";
    drawSlide(cv.getContext("2d"), seq.slides[0], cv.width, cv.height, seq.style);
    card.appendChild(cv);
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
  syncStyleControls();
  $("#overlay").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  renderThumbs(); drawEditor();
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
function drawEditor() { drawSlide(ctx(), curSlide(), CANVAS_W, CANVAS_H, state.active.style, true); renderEditPanel(); }

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
function openSaveTplModal() {
  const s = state.active;
  $("#saveTplName").value = s.title || "Plantilla";
  $("#saveTplCat").value = s.category;
  $("#saveTplModal").classList.remove("hidden");
}
async function confirmSaveTpl() {
  const s = state.active;
  const title = $("#saveTplName").value.trim() || "Plantilla";
  const category = $("#saveTplCat").value;
  const tpl = {
    id: "u" + Date.now(),
    title, category, isUser: true,
    style: JSON.parse(JSON.stringify(s.style)),
    slides: s.slides.map(sl => ({ body: sl.body, pos: { ...sl.pos }, align: sl.align, overlay: sl.overlay }))
  };
  if (state.user) {
    const row = await sbDB.sbUpsertTemplate({ ...tpl });
    if (row) tpl.cloudId = row.id;
  }
  state.userTemplates.unshift(tpl);
  storeT.save(state.userTemplates);
  $("#saveTplModal").classList.add("hidden");
  if (state.view === "library") renderLibrary();
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

  // Nueva secuencia
  $("#newSeq").addEventListener("click", openTemplateModal);
  $("#tplClose").addEventListener("click", () => $("#tplModal").classList.add("hidden"));
  $("#tplModal").addEventListener("click", e => { if (e.target.id === "tplModal") $("#tplModal").classList.add("hidden"); });

  // Editor
  $("#editorClose").addEventListener("click", closeEditor);
  $("#editorTitle").addEventListener("input", e => { state.active.title = e.target.value; });
  $("#statusSelect").addEventListener("change", e => { state.active.status = e.target.value; persist(); });
  $("#catSelect").addEventListener("change", e => { state.active.category = e.target.value; persist(); });
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

  $("#saveBtn").addEventListener("click", () => {
    persist(); const b = $("#saveBtn"), prev = b.textContent;
    b.textContent = "✓ Guardada"; b.disabled = true;
    setTimeout(() => { b.textContent = prev; b.disabled = false; }, 1400);
  });
  $("#submitBtn").addEventListener("click", () => {
    state.active.submitted = true; persist();
    alert("¡Enviada a revisión!");
  });
  $("#tplSaveBtn").addEventListener("click", openSaveTplModal);
  $("#saveTplClose").addEventListener("click", () => $("#saveTplModal").classList.add("hidden"));
  $("#saveTplCancel").addEventListener("click", () => $("#saveTplModal").classList.add("hidden"));
  $("#saveTplOk").addEventListener("click", confirmSaveTpl);
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
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appRoot").classList.remove("hidden");
  document.getElementById("userEmail").textContent = user.email || "";
  document.getElementById("adminTab").classList.toggle("hidden", !state.isAdminUser);

  // Carga imágenes persistidas ANTES de pintar
  await loadImagesFromDB();

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

  setView("library");
  setTimeout(() => startTour(false), 600);
}

function showLogin() {
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("appRoot").classList.add("hidden");
}

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
  document.getElementById("logoutBtn").addEventListener("click", async () => { await sbAuth.sbSignOut(); });
}

async function init() {
  fillFontSelect();
  bind();
  bindLogin();

  sb.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) await bootLoggedIn(session.user);
    else { state.user = null; showLogin(); }
  });

  const s = await sbAuth.sbGetSession();
  if (s) await bootLoggedIn(s.user);
  else showLogin();
}
document.addEventListener("DOMContentLoaded", init);
