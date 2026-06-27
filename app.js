/* =========================================================================
 *  ABMedia · Story Builder
 *  Stories estilo Instagram: foto de fondo aleatoria + párrafos editables
 *  con resaltado/subrayado + foto insertable (pantallazo de resultados).
 *
 *  Persistencia: localStorage (capa store.*), lista para conectar a un
 *  backend con login (Supabase) — ver auth.js / README.
 * ========================================================================= */

const state = {
  images: [],          // [{ name, img }]  (solo en memoria)
  sequences: [],
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
  KEY: "abmedia_sequences_v2",
  load() { try { return JSON.parse(localStorage.getItem(this.KEY)) || null; } catch { return null; } },
  save(seqs) {
    const data = seqs.map(s => ({
      id: s.id, title: s.title, category: s.category, status: s.status,
      submitted: !!s.submitted, style: s.style,
      slides: s.slides.map(sl => ({ body: sl.body, vpos: sl.vpos, overlay: sl.overlay }))
    }));
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); } catch {}
  }
};
const persist = () => store.save(state.sequences);

/* =========================================================================
 *  Construcción de secuencias
 * ========================================================================= */
function newStyle() { return JSON.parse(JSON.stringify(DEFAULT_STYLE)); }

function makeSlide(s) {
  return {
    body: s.body, vpos: s.vpos || "bottom", overlay: s.overlay || "bottom",
    bgIndex: -1, inset: null
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
  const slides = Array.from({ length: st.frames }, (_, i) => ({ body: blankBody(i), vpos: "bottom", overlay: "bottom" }));
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
  ["desk", "library", "mine"].forEach(v => $("#view-" + v).classList.toggle("hidden", v !== view));
  renderAll();
}
function renderAll() {
  if (state.view === "desk") { renderInbox(); renderGrid(); }
  else if (state.view === "library") renderCatalog();
  else if (state.view === "mine") renderMine();
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
}
function renderCatalog() {
  renderCatChips();
  const grid = $("#catalogGrid"); grid.innerHTML = "";
  CATALOG.filter(c => state.cat === "all" || c.category === state.cat).forEach(item => {
    const seq = fromCatalog(item.id);
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
        <p class="card-obj">${item.objective}</p>
        <button class="btn btn-primary sm full">Usar esta secuencia →</button>`;
    info.querySelector("button").addEventListener("click", () => {
      const created = fromCatalog(item.id, { status: "draft" });
      state.sequences.unshift(created); persist(); openEditor(created.id);
    });
    card.appendChild(info); grid.appendChild(card);
  });
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
    tools.querySelector('[data-act="submit"]').addEventListener("click", e => {
      e.stopPropagation(); seq.submitted = true; persist(); renderMine();
      alert("¡Enviada a revisión! Con cuentas activadas, ABMedia podrá revisarla y, con tu permiso, añadirla al catálogo general.");
    });
    tools.querySelector('[data-act="del"]').addEventListener("click", e => {
      e.stopPropagation();
      if (!confirm("¿Eliminar esta secuencia?")) return;
      state.sequences = state.sequences.filter(s => s.id !== seq.id); persist(); renderMine();
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
  $("#sizeSelect").value = String(st.size);
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
    state.active.slides.push(makeSlide({ body: blankBody(0), vpos: "bottom", overlay: "bottom" }));
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
  $("#slideName").textContent = "Frame " + (state.current + 1);
  $("#bodyInput").value = slide.body;
  $("#vposSelect").value = slide.vpos;
  $("#overlaySelect").value = slide.overlay;
  $("#insetControls").classList.toggle("hidden", !slide.inset);
}
function drawEditor() { drawSlide(ctx(), curSlide(), CANVAS_W, CANVAS_H, state.active.style); renderEditPanel(); }

/* =========================================================================
 *  MOTOR DE RENDER
 * ========================================================================= */
function drawSlide(c, slide, w, h, style) {
  const scale = w / CANVAS_W;
  c.clearRect(0, 0, w, h);
  const imgObj = slide.bgIndex >= 0 ? state.images[slide.bgIndex] : null;
  if (imgObj) drawCover(c, imgObj.img, 0, 0, w, h); else drawPlaceholder(c, w, h);
  drawOverlay(c, slide.overlay, w, h);
  if (slide.inset && slide.inset.img) drawInset(c, slide.inset, w, h);
  drawBody(c, slide, style, scale, w, h);
}
function drawCover(c, img, x, y, w, h) {
  const ir = img.width / img.height, tr = w / h;
  let dw, dh, dx, dy;
  if (ir > tr) { dh = h; dw = h * ir; dx = x + (w - dw) / 2; dy = y; }
  else { dw = w; dh = w / ir; dx = x; dy = y + (h - dh) / 2; }
  c.drawImage(img, dx, dy, dw, dh);
}
function drawPlaceholder(c, w, h) {
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#2a2320"); g.addColorStop(1, "#14110f");
  c.fillStyle = g; c.fillRect(0, 0, w, h);
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
  segs.forEach(s => s.text.split(/(\s+)/).forEach(p => {
    if (p === "") return;
    words.push({ text: p, space: /^\s+$/.test(p), hl: s.hl, ul: s.ul, ac: s.ac });
  }));
  return words;
}
function drawBody(c, slide, style, scale, w, h) {
  const text = (slide.body || "").trim();
  if (!text) return;
  const size = 62 * style.size * scale;
  const lh = size * 1.32;
  const parGap = size * 0.55;
  const margin = 84 * scale;
  const maxW = w - margin * 2;
  c.font = `${style.weight} ${size}px ${style.font}`;
  c.textBaseline = "alphabetic";

  // Layout: paragraphs -> lines (array of word tokens with x)
  const paragraphs = text.split("\n");
  const layout = []; // { lines:[ {words:[{...,x,w}], width} ] , isGap }
  paragraphs.forEach(par => {
    if (par.trim() === "") { layout.push({ gap: true }); return; }
    const words = segsToWords(tokenizeLine(par));
    words.forEach(t => t.w = c.measureText(t.text).width);
    const lines = []; let line = [], lineW = 0;
    words.forEach(t => {
      if (!t.space && lineW + t.w > maxW && line.length) {
        lines.push({ words: line, width: lineW }); line = []; lineW = 0;
      }
      if (t.space && line.length === 0) return; // no leading space
      t.x = lineW; line.push(t); lineW += t.w;
    });
    if (line.length) lines.push({ words: line, width: lineW });
    layout.push({ lines });
  });

  // Altura total
  let total = 0;
  layout.forEach(block => {
    if (block.gap) { total += parGap; return; }
    total += block.lines.length * lh;
  });

  // Posición vertical
  const top = margin + size, bottomMargin = 150 * scale;
  let y;
  if (slide.vpos === "top") y = top;
  else if (slide.vpos === "center") y = (h - total) / 2 + size;
  else y = h - total - bottomMargin + size;

  const x0 = margin;
  layout.forEach(block => {
    if (block.gap) { y += parGap; return; }
    block.lines.forEach(ln => {
      // 1) cajas de resaltado (runs contiguos hl)
      let i = 0;
      while (i < ln.words.length) {
        if (ln.words[i].hl) {
          let j = i, startX = ln.words[i].x, endX = ln.words[i].x + ln.words[i].w;
          while (j < ln.words.length && ln.words[j].hl) { endX = ln.words[j].x + ln.words[j].w; j++; }
          const padX = size * 0.16, padY = size * 0.14;
          c.fillStyle = style.highlightColor;
          roundRect(c, x0 + startX - padX, y - size + size * 0.04 - padY, (endX - startX) + padX * 2, size + padY * 1.4, size * 0.16);
          c.fill();
          i = j;
        } else i++;
      }
      // 2) texto
      ln.words.forEach(t => {
        if (t.space) return;
        c.fillStyle = t.hl ? style.highlightText : (t.ac ? style.highlightColor : style.textColor);
        if (!t.hl) { c.shadowColor = "rgba(0,0,0,0.55)"; c.shadowBlur = size * 0.14; c.shadowOffsetY = size * 0.03; }
        c.fillText(t.text, x0 + t.x, y);
        c.shadowColor = "transparent"; c.shadowBlur = 0; c.shadowOffsetY = 0;
      });
      // 3) subrayados (runs contiguos ul)
      let k = 0;
      while (k < ln.words.length) {
        if (ln.words[k].ul) {
          let j = k, sX = ln.words[k].x, eX = ln.words[k].x + ln.words[k].w;
          while (j < ln.words.length && ln.words[j].ul) { eX = ln.words[j].x + ln.words[j].w; j++; }
          c.strokeStyle = style.highlightColor; c.lineWidth = size * 0.07; c.lineCap = "round";
          const uy = y + size * 0.16;
          c.beginPath(); c.moveTo(x0 + sX, uy); c.lineTo(x0 + eX, uy); c.stroke();
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
function setupInsetDrag() {
  const cv = editorCanvas;
  let dragging = false, offX = 0, offY = 0;
  const pos = e => {
    const r = cv.getBoundingClientRect();
    const cx = (e.clientX - r.left) / r.width;
    const cy = (e.clientY - r.top) / r.height;
    return { cx, cy };
  };
  cv.addEventListener("pointerdown", e => {
    const ins = state.active && curSlide().inset;
    if (!ins) return;
    const { cx, cy } = pos(e);
    const iw = ins.scale, ih = ins.scale * (ins.img.height / ins.img.width) * (CANVAS_W / CANVAS_H);
    if (Math.abs(cx - ins.cx) < iw / 2 && Math.abs(cy - ins.cy) < ih / 2) {
      dragging = true; offX = cx - ins.cx; offY = cy - ins.cy; cv.setPointerCapture(e.pointerId);
    }
  });
  cv.addEventListener("pointermove", e => {
    if (!dragging) return;
    const { cx, cy } = pos(e);
    const ins = curSlide().inset;
    ins.cx = Math.max(0.05, Math.min(0.95, cx - offX));
    ins.cy = Math.max(0.05, Math.min(0.95, cy - offY));
    drawEditor();
  });
  cv.addEventListener("pointerup", e => { if (dragging) { dragging = false; refreshActiveThumb(); } });
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
async function downloadAll() {
  const off = document.createElement("canvas"); off.width = CANVAS_W; off.height = CANVAS_H;
  const oc = off.getContext("2d");
  const base = (state.active.title || "story").replace(/[^\w]+/g, "-").slice(0, 24) || "story";
  for (let i = 0; i < state.active.slides.length; i++) {
    drawSlide(oc, state.active.slides[i], CANVAS_W, CANVAS_H, state.active.style);
    await blobDownload(off, `${base}-${i + 1}.jpg`);
  }
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
  setupInsetDrag();

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

  // Texto del frame
  $("#bodyInput").addEventListener("input", e => { curSlide().body = e.target.value; drawEditor(); refreshActiveThumb(); });
  $("#vposSelect").addEventListener("change", e => { curSlide().vpos = e.target.value; drawEditor(); refreshActiveThumb(); persist(); });
  $("#overlaySelect").addEventListener("change", e => { curSlide().overlay = e.target.value; drawEditor(); refreshActiveThumb(); persist(); });
  $("#mkHighlight").addEventListener("click", () => wrapSelection("=="));
  $("#mkUnderline").addEventListener("click", () => wrapSelection("__"));
  $("#mkAccent").addEventListener("click", () => wrapSelection("**"));

  // Estilo de la secuencia
  $("#fontSelect").addEventListener("change", e => { state.active.style.font = e.target.value; drawEditor(); renderThumbs(); persist(); });
  $("#highlightColor").addEventListener("input", e => { state.active.style.highlightColor = e.target.value; drawEditor(); renderThumbs(); persist(); });
  $("#textColor").addEventListener("input", e => { state.active.style.textColor = e.target.value; drawEditor(); renderThumbs(); persist(); });
  $("#sizeSelect").addEventListener("change", e => { state.active.style.size = parseFloat(e.target.value); drawEditor(); renderThumbs(); persist(); });

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
  $("#dlOne").addEventListener("click", () => blobDownload(editorCanvas, `story-${state.current + 1}.jpg`));
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
 *  Arranque
 * ========================================================================= */
function init() {
  fillFontSelect();
  bind();
  const saved = store.load();
  if (saved && saved.length) state.sequences = saved.map(d => instantiate(d));
  else { state.sequences = DEMO_SEQS.map(d => fromCatalog(d.catalogId, { status: d.status })); persist(); }
  state.inbox = SEED_INBOX.map(x => ({ ...x }));
  updateImgCount();
  setView("desk");
}
document.addEventListener("DOMContentLoaded", init);
