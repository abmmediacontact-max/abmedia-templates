/* =========================================================================
 *  ABMedia · Story Builder
 *  Stories estilo Instagram: foto de fondo aleatoria + párrafos editables
 *  con resaltado/subrayado + foto insertable (pantallazo de resultados).
 *
 *  Persistencia: localStorage (capa store.*), lista para conectar a un
 *  backend con login (Supabase) — ver auth.js / README.
 * ========================================================================= */

const state = {
  user: null,
  isAdminUser: false,
  images: [],          // [{ name, img }]  (solo en memoria)
  sequences: [],
  userTemplates: [],   // las del usuario (privadas o pendientes/aprobadas)
  publicTemplates: [], // catálogo general aprobado por admin
  reviewQueue: [],     // (admin) plantillas pendientes
  inbox: [],
  active: null,
  current: 0,
  view: "desk",
  filter: "all",
  cat: "all",
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

const SEED_INBOX = [
  { brief: "Quiero contar por qué vuelvo a esto después de tiempo.", structure: "s3", category: "lifestyle" },
  { brief: "Tengo plazas abiertas y quiero llenarlas esta semana.", structure: "s3", category: "ventas" }
];

const DEMO_SEQS = [
  { catalogId: "a-resultado", status: "published" },
  { catalogId: "v-oferta",    status: "scheduled" },
  { catalogId: "val-tips",    status: "progress" },
  { catalogId: "l-bts",       status: "draft" }
];

/* =========================================================================
 *  Almacenamiento (localStorage; sustituible por backend con login)
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
// Guarda localmente (cache) Y en la nube (asíncrono, no bloquea).
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
    pos: s.pos || { x: 0.05, y: 0.085 },   // por defecto: arriba-izquierda (esquina del bloque)
    align: s.align || "left",
    bg: s.bg ? { ...s.bg } : { zoom: 1, ox: 0, oy: 0 },  // zoom/desplazamiento del fondo
    bgIndex: -1, inset: null, _textBox: null
  };
}

function instantiate(data) {
  const seq = {
    id: data.id || state.seq++,
    title: data.title || "Secuencia",
    category: data.category || "valor",
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

function fromStructure(key, category) {
  const st = STRUCTURES[key];
  const slides = Array.from({ length: st.frames }, (_, i) => ({ body: blankBody(i), overlay: "bottom" }));
  return instantiate({ title: "Nueva secuencia", category, slides, status: "draft" });
}

function assignRandomImages(seq) {
  const n = state.images.length;
  if (!n) { seq.slides.forEach(s => s.bgIndex = -1); return; }
  const pool = shuffle([...Array(n).keys()]);
  seq.slides.forEach((s, i) => { s.bgIndex = pool[i % pool.length]; });
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* =========================================================================
 *  Imágenes de fondo (carpeta)
 * ========================================================================= */
function loadFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.type.startsWith("image/"));
  if (!files.length) return;
  let pending = files.length;
  files.forEach(file => {
    const img = new Image();
    img.onload = () => { state.images.push({ name: file.name, img }); done(); };
    img.onerror = done;
    img.src = URL.createObjectURL(file);
    function done() {
      if (--pending === 0) {
        updateImgCount();
        state.sequences.forEach(s => { if (s.slides.some(sl => sl.bgIndex < 0)) assignRandomImages(s); });
        renderAll();
        if (state.active) { assignRandomImages(state.active); drawEditor(); renderThumbs(); }
      }
    }
  });
}
function updateImgCount() {
  const n = state.images.length;
  $("#imgCount").textContent = n;
  $("#imgState").classList.toggle("ok", n > 0);
}

/* =========================================================================
 *  Vistas
 * ========================================================================= */
function setView(view) {
  state.view = view;
  $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.view === view));
  ["desk", "library", "mine", "admin"].forEach(v => $("#view-" + v).classList.toggle("hidden", v !== view));
  renderAll();
}
function renderAll() {
  if (state.view === "desk") { renderInbox(); renderGrid(); }
  else if (state.view === "library") renderCatalog();
  else if (state.view === "mine") renderMine();
  else if (state.view === "admin") renderAdmin();
}

async function renderAdmin() {
  const grid = $("#adminGrid"); grid.innerHTML = `<p class="empty">Cargando…</p>`;
  const items = await sbDB.sbFetchTemplates("review");
  grid.innerHTML = "";
  if (!items.length) { grid.innerHTML = `<p class="empty">No hay plantillas pendientes.</p>`; return; }
  items.forEach(row => {
    const tpl = { id: "r" + row.id, cloudId: row.id, title: row.title, category: row.category, style: row.style, slides: row.slides };
    const seq = fromTemplate(tpl);
    const cat = CATEGORIES[tpl.category] || CATEGORIES.valor;
    const card = document.createElement("div"); card.className = "card";
    const cv = document.createElement("canvas"); cv.width = 270; cv.height = 480; cv.className = "card-canvas";
    drawSlide(cv.getContext("2d"), seq.slides[0], cv.width, cv.height, seq.style);
    card.appendChild(cv);
    const badge = document.createElement("span"); badge.className = "frames-badge"; badge.textContent = `${seq.slides.length} frames`;
    card.appendChild(badge);
    const info = document.createElement("div"); info.className = "card-info";
    info.innerHTML = `<div class="card-row"><h3>${tpl.title}</h3>
        <span class="cat-tag">${cat.emoji} ${cat.name}</span></div>
        <p class="card-obj">Enviada para revisión</p>
        <button class="btn btn-primary sm full" data-act="approve">✅ Aprobar y publicar</button>`;
    info.querySelector('[data-act="approve"]').addEventListener("click", async () => {
      await sbDB.sbApproveTemplate(row.id);
      renderAdmin();
    });
    card.appendChild(info); grid.appendChild(card);
  });
}

/* ---- Production desk ---- */
function renderInbox() {
  const box = $("#inboxList");
  box.innerHTML = "";
  if (!state.inbox.length) { box.innerHTML = `<p class="empty">Bandeja vacía 🎉</p>`; return; }
  state.inbox.forEach((item, i) => {
    const frames = STRUCTURES[item.structure].frames;
    const el = document.createElement("div");
    el.className = "inbox-item";
    el.innerHTML = `<p>${item.brief}</p>
      <span class="meta">PENDIENTE · ${frames} frames</span>
      <button class="btn btn-primary sm">Crear secuencia</button>`;
    el.querySelector("button").addEventListener("click", () => {
      const seq = fromStructure(item.structure, item.category);
      seq.title = item.brief.length > 46 ? item.brief.slice(0, 46) + "…" : item.brief;
      state.sequences.unshift(seq);
      state.inbox.splice(i, 1);
      persist(); renderAll(); openEditor(seq.id);
    });
    box.appendChild(el);
  });
}
function renderGrid() {
  const grid = $("#grid"); grid.innerHTML = "";
  const list = state.sequences.filter(s => state.filter === "all" || s.status === state.filter);
  if (!list.length) { grid.innerHTML = `<p class="empty">No hay secuencias en este estado.</p>`; updateCounts(); return; }
  list.forEach(seq => grid.appendChild(makeCard(seq)));
  updateCounts();
}
function makeCard(seq) {
  const card = document.createElement("div");
  card.className = "card";
  const st = STATUS[seq.status], cat = CATEGORIES[seq.category];
  const cv = document.createElement("canvas");
  cv.width = 270; cv.height = 480; cv.className = "card-canvas";
  drawSlide(cv.getContext("2d"), seq.slides[0], cv.width, cv.height, seq.style);
  card.appendChild(cv);
  const badge = document.createElement("span");
  badge.className = "frames-badge"; badge.textContent = `${seq.slides.length} frames`;
  card.appendChild(badge);
  if (seq.submitted) {
    const rev = document.createElement("span");
    rev.className = "review-badge"; rev.textContent = "⏳ En revisión";
    card.appendChild(rev);
  }
  const info = document.createElement("div");
  info.className = "card-info";
  info.innerHTML = `<div class="card-row"><h3>${seq.title}</h3>
      <span class="status ${st.cls}">${st.label}</span></div>
      <span class="cat-tag">${cat ? cat.emoji + " " + cat.name : ""}</span>`;
  card.appendChild(info);
  card.addEventListener("click", () => openEditor(seq.id));
  return card;
}
function updateCounts() {
  const c = { all: state.sequences.length, draft: 0, progress: 0, scheduled: 0, published: 0 };
  state.sequences.forEach(s => c[s.status]++);
  $$(".tab").forEach(t => { t.querySelector(".count").textContent = c[t.dataset.filter] ?? 0; });
}

/* ---- Biblioteca ---- */
function renderCatChips() {
  const box = $("#catChips"); box.innerHTML = "";
  const mk = (key, label) => {
    const b = document.createElement("button");
    b.className = "chip-btn" + (state.cat === key ? " active" : "");
    b.innerHTML = label;
    b.addEventListener("click", () => { state.cat = key; renderCatalog(); });
    box.appendChild(b);
  };
  mk("all", "Todas");
  Object.entries(CATEGORIES).forEach(([k, c]) => mk(k, `${c.emoji} ${c.name}`));
  mk("mine", "⭐ Mías");
}
function renderCatalog() {
  renderCatChips();
  const grid = $("#catalogGrid"); grid.innerHTML = "";
  if (state.cat === "mine") {
    if (!state.userTemplates.length) {
      grid.innerHTML = `<p class="empty">Aún no tienes plantillas propias. Abre una secuencia en el editor y pulsa "Guardar como plantilla".</p>`;
      return;
    }
    state.userTemplates.forEach(item => grid.appendChild(makeLibCard(item, true)));
    return;
  }
  CATALOG.filter(c => state.cat === "all" || c.category === state.cat)
    .forEach(item => grid.appendChild(makeLibCard(item, false)));
}
function makeLibCard(item, isUser) {
  const seq = isUser ? fromTemplate(item) : fromCatalog(item.id);
  const cat = CATEGORIES[item.category];
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
      <span class="cat-tag">${cat.emoji} ${cat.name}</span></div>
      ${item.objective ? `<p class="card-obj">${item.objective}</p>` : ""}
      <button class="btn btn-primary sm full" data-act="use">Usar esta secuencia →</button>
      ${isUser ? `<button class="btn btn-ghost xs full danger" data-act="del">🗑 Borrar plantilla</button>` : ""}`;
  info.querySelector('[data-act="use"]').addEventListener("click", () => {
    const created = isUser ? fromTemplate(item, { status: "draft" }) : fromCatalog(item.id, { status: "draft" });
    state.sequences.unshift(created); persist(); openEditor(created.id);
  });
  if (isUser) info.querySelector('[data-act="del"]').addEventListener("click", async () => {
    if (!confirm("¿Borrar esta plantilla?")) return;
    if (state.user && item.cloudId) await sbDB.sbDeleteTemplate(item.cloudId);
    state.userTemplates = state.userTemplates.filter(t => t.id !== item.id);
    storeT.save(state.userTemplates); renderCatalog();
  });
  card.appendChild(info);
  return card;
}

/* ---- Mis secuencias ---- */
function renderMine() {
  const grid = $("#mineGrid"); grid.innerHTML = "";
  if (!state.sequences.length) { grid.innerHTML = `<p class="empty">Aún no has guardado secuencias. Crea una desde la Biblioteca.</p>`; return; }
  state.sequences.forEach(seq => {
    const card = makeCard(seq);
    const tools = document.createElement("div");
    tools.className = "mine-tools";
    tools.innerHTML = `<button class="btn btn-ghost xs" data-act="submit" ${seq.submitted ? "disabled" : ""}>${seq.submitted ? "⏳ En revisión" : "📤 Enviar a revisión"}</button>
      <button class="btn btn-ghost xs danger" data-act="del">🗑</button>`;
    tools.querySelector('[data-act="submit"]').addEventListener("click", async e => {
      e.stopPropagation(); seq.submitted = true; persist();
      // crea una plantilla asociada a la secuencia y la manda a revisión
      if (state.user) {
        const tplRow = await sbDB.sbUpsertTemplate({
          title: seq.title, category: seq.category, style: seq.style,
          slides: seq.slides.map(sl => ({ body: sl.body, pos: sl.pos, align: sl.align, overlay: sl.overlay })),
          submitted: true, is_public: false
        });
        if (tplRow) {
          state.userTemplates.unshift({ id: "u" + tplRow.id, cloudId: tplRow.id, title: tplRow.title, category: tplRow.category, style: tplRow.style, slides: tplRow.slides, submitted: true, isUser: true });
        }
      }
      renderMine();
      alert("¡Enviada a revisión! ABMedia la podrá revisar y, con tu permiso, añadirla al catálogo general.");
    });
    tools.querySelector('[data-act="del"]').addEventListener("click", async e => {
      e.stopPropagation();
      if (!confirm("¿Eliminar esta secuencia?")) return;
      if (state.user && seq.cloudId) await sbDB.sbDeleteSequence(seq.cloudId);
      state.sequences = state.sequences.filter(s => s.id !== seq.id); store.save(state.sequences); renderMine();
    });
    card.appendChild(tools); grid.appendChild(card);
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
  $("#fontSelect").value = st.font;
  $("#highlightColor").value = st.highlightColor;
  $("#textColor").value = st.textColor;
  $("#sizeRange").value = String(st.size);
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
  // botón añadir frame
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
  $("#overlaySelect").value = slide.overlay;
  $("#bgZoom").value = slide.bg.zoom;
  $("#insetControls").classList.toggle("hidden", !slide.inset);
  renderBgPicker();
}
function renderBgPicker() {
  const box = $("#bgPicker"); if (!box) return;
  box.innerHTML = "";
  if (!state.images.length) { box.innerHTML = `<span class="bg-empty">Sube fotos para elegir el fondo.</span>`; return; }
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
 *  MOTOR DE RENDER
 * ========================================================================= */
// Zona segura de Instagram Stories (fracciones del lienzo 1080x1920)
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
  dx = Math.min(0, Math.max(w - dw, dx));   // mantener cobertura (sin huecos)
  dy = Math.min(0, Math.max(h - dh, dy));
  c.drawImage(img, dx, dy, dw, dh);
}
function drawPlaceholder(c, w, h) {
  // Fondo neutro vacío: aquí irá la imagen que suba el usuario.
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

/* ---- Texto en párrafos con resaltado / subrayado ---- */
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
// Márgenes del lienzo para el texto (fracciones)
const TXT = { left: 0.05, right: 0.95 };

// Calcula el layout del texto: anclaje arriba-izquierda en slide.pos,
// el ancho se adapta hasta el margen derecho => NUNCA se corta (añade líneas).
function layoutBody(c, slide, style, scale, w, h) {
  const text = (slide.body || "").trim();
  if (!text) return null;
  const size = 46 * style.size * scale;
  const lh = size * 1.34;
  const parGap = size * 0.6;
  c.font = `${style.weight} ${size}px ${style.font}`;
  c.textAlign = "left";
  c.textBaseline = "alphabetic";

  const lx = slide.pos.x;                         // esquina superior-izquierda (normalizada)
  const left = lx * w;
  const maxW = Math.max(size * 2.5, (TXT.right - lx) * w);  // ancho disponible hasta el margen derecho
  const sp = c.measureText(" ").width;

  const layout = []; let blockW = 0;
  text.split("\n").forEach(par => {
    if (par.trim() === "") { layout.push({ gap: true }); return; }
    // tokeniza y parte palabras más anchas que maxW (corte por caracteres)
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
      // 1) cajas de resaltado (siguen al texto: relativas a 'left')
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
      // 2) texto
      ln.words.forEach(t => {
        c.fillStyle = t.hl ? style.highlightText : (t.ac ? style.highlightColor : style.textColor);
        if (!t.hl) { c.shadowColor = "rgba(0,0,0,0.5)"; c.shadowBlur = size * 0.12; c.shadowOffsetY = size * 0.025; }
        c.fillText(t.text, left + t.x, y);
        c.shadowColor = "transparent"; c.shadowBlur = 0; c.shadowOffsetY = 0;
      });
      // 3) subrayados
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
 *  Imagen insertada (pantallazo): arrastrar y redimensionar
 * ========================================================================= */
function setupDrag() {
  const cv = editorCanvas;
  let target = null, start = null;   // target: "inset" | "text" | "bg"
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
    if (slide.bgIndex >= 0) {  // arrastrar el fondo (pan)
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
      // pos = esquina arriba-izquierda. El ancho se reajusta solo, así que solo
      // limitamos para que el bloque quede dentro de la zona segura sin cortarse.
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

/* ---- Gestión de frames ---- */
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

/* ---- Plantillas propias del usuario ---- */
const storeT = {
  KEY: "abmedia_user_templates_v2",
  load() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
  save(t) { try { localStorage.setItem(this.KEY, JSON.stringify(t)); } catch {} }
};
function fromTemplate(tpl, extra = {}) {
  return instantiate({ title: tpl.title, category: tpl.category, slides: tpl.slides, style: tpl.style, ...extra });
}
async function saveAsTemplate() {
  const s = state.active;
  const tpl = {
    id: "u" + Date.now(),
    title: s.title || "Plantilla",
    category: s.category,
    isUser: true,
    style: JSON.parse(JSON.stringify(s.style)),
    slides: s.slides.map(sl => ({ body: sl.body, pos: { ...sl.pos }, align: sl.align, overlay: sl.overlay }))
  };
  if (state.user) {
    const row = await sbDB.sbUpsertTemplate({ ...tpl });
    if (row) tpl.cloudId = row.id;
  }
  state.userTemplates.unshift(tpl);
  storeT.save(state.userTemplates);
  alert('Guardada en tus plantillas. La encontrarás en Biblioteca → "⭐ Mías".');
  if (state.view === "library") renderCatalog();
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
    } else { // sin JSZip: descarga una a una
      const off = document.createElement("canvas"); off.width = CANVAS_W; off.height = CANVAS_H; const oc = off.getContext("2d");
      for (let i = 0; i < state.active.slides.length; i++) { drawSlide(oc, state.active.slides[i], CANVAS_W, CANVAS_H, state.active.style); await blobDownload(off, `${base}-${i + 1}.jpg`); }
    }
  } finally { btn.disabled = false; btn.textContent = prev; }
}

/* =========================================================================
 *  Modal "Nueva secuencia"
 * ========================================================================= */
function openTemplateModal() {
  const box = $("#tplList"); box.innerHTML = "";
  Object.entries(STRUCTURES).forEach(([key, st]) => {
    const b = document.createElement("button"); b.className = "tpl-card";
    b.innerHTML = `<strong>${st.name}</strong><em>${st.frames} frames en blanco</em>`;
    b.addEventListener("click", () => {
      const seq = fromStructure(key, "valor");
      state.sequences.unshift(seq); persist();
      $("#tplModal").classList.add("hidden"); openEditor(seq.id);
    });
    box.appendChild(b);
  });
  $("#tplModal").classList.remove("hidden");
}

/* =========================================================================
 *  Marcas inline en el textarea (resaltar / subrayar / acento)
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
 *  Eventos
 * ========================================================================= */
function bind() {
  editorCanvas = $("#editorCanvas");
  setupDrag();

  $$(".nav-item").forEach(n => n.addEventListener("click", () => setView(n.dataset.view)));

  ["#fileInput", "#fileInput2"].forEach(sel => { const el = $(sel); if (el) el.addEventListener("change", e => loadFiles(e.target.files)); });
  $("#uploadBtn").addEventListener("click", () => $("#fileInput").click());
  const drop = $("#editorDrop");
  drop.addEventListener("click", () => $("#fileInput2").click());
  ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("hover"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("hover"); }));
  drop.addEventListener("drop", e => loadFiles(e.dataTransfer.files));

  $$(".tab").forEach(t => t.addEventListener("click", () => {
    $$(".tab").forEach(x => x.classList.remove("active")); t.classList.add("active");
    state.filter = t.dataset.filter; renderGrid();
  }));

  $("#newSeq").addEventListener("click", openTemplateModal);
  $("#tplClose").addEventListener("click", () => $("#tplModal").classList.add("hidden"));
  $("#tplModal").addEventListener("click", e => { if (e.target.id === "tplModal") $("#tplModal").classList.add("hidden"); });

  $("#editorClose").addEventListener("click", closeEditor);
  $("#editorTitle").addEventListener("input", e => { state.active.title = e.target.value; });
  $("#statusSelect").addEventListener("change", e => { state.active.status = e.target.value; persist(); });
  $("#catSelect").addEventListener("change", e => { state.active.category = e.target.value; persist(); });

  // Gestión de frames
  $("#dupFrame").addEventListener("click", duplicateFrame);
  $("#delFrame").addEventListener("click", deleteFrame);
  $("#moveFramePrev").addEventListener("click", () => moveFrame(-1));
  $("#moveFrameNext").addEventListener("click", () => moveFrame(1));

  // Fondo del frame (zoom)
  $("#bgZoom").addEventListener("input", e => { curSlide().bg.zoom = parseFloat(e.target.value); drawEditor(); refreshActiveThumb(); });
  $("#bgZoom").addEventListener("change", persist);

  // Texto del frame
  $("#bodyInput").addEventListener("input", e => { curSlide().body = e.target.value; drawEditor(); refreshActiveThumb(); });
  $("#overlaySelect").addEventListener("change", e => { curSlide().overlay = e.target.value; drawEditor(); refreshActiveThumb(); persist(); });
  $("#mkHighlight").addEventListener("click", () => wrapSelection("=="));
  $("#mkUnderline").addEventListener("click", () => wrapSelection("__"));
  $("#mkAccent").addEventListener("click", () => wrapSelection("**"));

  // Estilo de la secuencia
  $("#fontSelect").addEventListener("change", e => { state.active.style.font = e.target.value; drawEditor(); renderThumbs(); persist(); });
  $("#highlightColor").addEventListener("input", e => { state.active.style.highlightColor = e.target.value; drawEditor(); renderThumbs(); persist(); });
  $("#textColor").addEventListener("input", e => { state.active.style.textColor = e.target.value; drawEditor(); renderThumbs(); persist(); });
  $("#sizeRange").addEventListener("input", e => { state.active.style.size = parseFloat(e.target.value); drawEditor(); refreshActiveThumb(); });
  $("#sizeRange").addEventListener("change", persist);

  // Imágenes
  $("#shuffleAll").addEventListener("click", () => { assignRandomImages(state.active); drawEditor(); renderThumbs(); });
  $("#newImg").addEventListener("click", () => {
    const n = state.images.length; if (n <= 1) return;
    const slide = curSlide(); let next; do { next = Math.floor(Math.random() * n); } while (next === slide.bgIndex);
    slide.bgIndex = next; drawEditor(); refreshActiveThumb();
  });

  // Foto insertada (pantallazo)
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

  // Guardar / revisión / descargas
  $("#saveBtn").addEventListener("click", () => {
    persist(); const b = $("#saveBtn"), prev = b.textContent;
    b.textContent = "✓ Guardada"; b.disabled = true;
    setTimeout(() => { b.textContent = prev; b.disabled = false; }, 1400);
  });
  $("#submitBtn").addEventListener("click", () => {
    state.active.submitted = true; persist();
    alert("¡Enviada a revisión! Con cuentas activadas, ABMedia podrá revisarla y, con tu permiso, añadirla al catálogo general.");
  });
  $("#tplSaveBtn").addEventListener("click", saveAsTemplate);
  $("#dlOne").addEventListener("click", async () => {
    const blob = await renderToBlob(curSlide());  // exporta sin las guías
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `story-${state.current + 1}.jpg`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("#dlAll").addEventListener("click", downloadAll);

  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#overlay").classList.contains("hidden")) closeEditor(); });
}

/* =========================================================================
 *  Controles de tipografía (poblar select)
 * ========================================================================= */
function fillFontSelect() {
  const sel = $("#fontSelect"); sel.innerHTML = "";
  FONTS.forEach(f => { const o = document.createElement("option"); o.value = f.value; o.textContent = f.name; sel.appendChild(o); });
}

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

  // Carga desde la nube
  const cloudSeqs = await sbDB.sbFetchSequences();
  if (cloudSeqs.length) {
    state.sequences = cloudSeqs.map(r => {
      const seq = instantiate({ title: r.title, category: r.category, status: r.status, submitted: r.submitted, style: r.style, slides: r.slides });
      seq.cloudId = r.id;
      return seq;
    });
  } else {
    // primer uso: rellena con demos y los sube
    state.sequences = DEMO_SEQS.map(d => fromCatalog(d.catalogId, { status: d.status }));
    for (const s of state.sequences) {
      const row = await sbDB.sbUpsertSequence(s);
      if (row) s.cloudId = row.id;
    }
  }
  const cloudTpls = await sbDB.sbFetchTemplates("mine");
  state.userTemplates = cloudTpls.map(r => ({ id: "u" + r.id, cloudId: r.id, title: r.title, category: r.category, style: r.style, slides: r.slides, submitted: r.submitted, isUser: true }));

  state.inbox = SEED_INBOX.map(x => ({ ...x }));
  updateImgCount();
  setView("desk");
}

function showLogin() {
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("appRoot").classList.add("hidden");
}

function bindLogin() {
  let mode = "signin"; // | "signup"
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
