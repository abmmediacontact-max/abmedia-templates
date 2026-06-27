/* =========================================================================
 *  ABMedia · Story Builder — Production desk
 *  Todo ocurre en el navegador: las imágenes nunca se suben a ningún servidor.
 * ========================================================================= */

const state = {
  images: [],          // [{ name, img }]
  sequences: [],       // pipeline de secuencias creadas
  inbox: [],           // ideas escritas pendientes de convertir
  active: null,        // secuencia que se está editando
  current: 0,          // slide actual dentro del editor
  filter: "all",
  accent: "#ff6a1a",   // naranja ABMedia
  font: "'Poppins', system-ui, sans-serif",
  seq: 1
};

const $ = (s) => document.querySelector(s);
const ctx = () => editorCanvas.getContext("2d");

/* --------- Datos de ejemplo (se ven al abrir, como en la referencia) ----- */
const SEED_INBOX = [
  { brief: "Algo que llevo tiempo sin abrir. Quiero contar por qué vuelvo a esto.", template: "minimal" },
  { brief: "Quiero hablar de dónde empecé de verdad y por qué casi lo dejo.", template: "tips" },
  { brief: "Estoy haciendo algo que nunca había hecho en público. Llevo meses dándole vueltas.", template: "promo" },
  { brief: "Déjame contarte qué nos diferencia de cualquier otro que hayas visto.", template: "testimonio" }
];

const SEED_SEQUENCES = [
  { title: "La estructura de 3 stories que mejor convierte", template: "tips", status: "progress" },
  { title: "Quiero enseñarte por qué construí esto", template: "promo", status: "scheduled" },
  { title: "Una rápida hoy. Sin gran pitch, sin cuenta atrás", template: "minimal", status: "scheduled" },
  { title: "Un vistazo a un día real trabajando", template: "tips", status: "progress" },
  { title: "Quiero enseñarte algo que pasó este mes", template: "testimonio", status: "progress" },
  { title: "Plazas abiertas: 3 horas, 5 sitios", template: "promo", status: "published" }
];

const STATUS = {
  draft:     { label: "Borrador",     cls: "st-draft" },
  progress:  { label: "En progreso",  cls: "st-progress" },
  scheduled: { label: "Programado",   cls: "st-scheduled" },
  published: { label: "Publicado",    cls: "st-published" }
};

/* ---------------------------------------------------------------------------
 *  Crear una secuencia a partir de una plantilla
 * ------------------------------------------------------------------------- */
function buildSequence({ title, template, status = "draft", brief = "" }) {
  const tpl = TEMPLATES[template] || TEMPLATES.promo;
  const slides = tpl.slides.map(def => ({
    def,
    imageIndex: 0,
    texts: Object.fromEntries(def.texts.map(t => [t.id, t.default]))
  }));
  const seq = { id: state.seq++, title, template, status, brief, slides };
  assignRandomImages(seq);
  return seq;
}

function assignRandomImages(seq) {
  const n = state.images.length;
  if (!n) { seq.slides.forEach(s => s.imageIndex = -1); return; }
  const pool = shuffle([...Array(n).keys()]);
  seq.slides.forEach((s, i) => { s.imageIndex = pool[i % pool.length]; });
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------------------------------------------------------------------------
 *  Carga de imágenes
 * ------------------------------------------------------------------------- */
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
        // reasigna imágenes a todas las secuencias que aún no tenían
        state.sequences.forEach(s => { if (s.slides.some(sl => sl.imageIndex < 0)) assignRandomImages(s); });
        renderGrid();
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

/* ---------------------------------------------------------------------------
 *  DASHBOARD
 * ------------------------------------------------------------------------- */
function renderInbox() {
  const box = $("#inboxList");
  box.innerHTML = "";
  if (!state.inbox.length) {
    box.innerHTML = `<p class="empty">Bandeja vacía 🎉</p>`;
    return;
  }
  state.inbox.forEach((item, i) => {
    const el = document.createElement("div");
    el.className = "inbox-item";
    const tpl = TEMPLATES[item.template];
    el.innerHTML = `
      <p>${item.brief}</p>
      <span class="meta">PENDIENTE · ${tpl.slides.length} frames</span>
      <button class="btn btn-primary sm">✦ Crear secuencia</button>`;
    el.querySelector("button").addEventListener("click", () => {
      const seq = buildSequence({
        title: item.brief.length > 48 ? item.brief.slice(0, 48) + "…" : item.brief,
        template: item.template,
        status: "draft",
        brief: item.brief
      });
      state.sequences.unshift(seq);
      state.inbox.splice(i, 1);
      renderInbox();
      renderGrid();
      openEditor(seq.id);
    });
    box.appendChild(el);
  });
}

function renderGrid() {
  const grid = $("#grid");
  grid.innerHTML = "";
  const list = state.sequences.filter(s => state.filter === "all" || s.status === state.filter);
  if (!list.length) {
    grid.innerHTML = `<p class="empty">No hay secuencias en este estado.</p>`;
    return;
  }
  list.forEach(seq => {
    const card = document.createElement("div");
    card.className = "card";
    const st = STATUS[seq.status];
    const cv = document.createElement("canvas");
    cv.width = 270; cv.height = 480; cv.className = "card-canvas";
    drawSlide(cv.getContext("2d"), seq.slides[0], cv.width, cv.height);
    card.appendChild(cv);
    const badge = document.createElement("span");
    badge.className = "frames-badge";
    badge.textContent = `${seq.slides.length} frames`;
    card.appendChild(badge);
    const info = document.createElement("div");
    info.className = "card-info";
    info.innerHTML = `
      <div class="card-row">
        <h3>${seq.title}</h3>
        <span class="status ${st.cls}">${st.label}</span>
      </div>
      <span class="edit-hint">Toca para editar los frames →</span>`;
    card.appendChild(info);
    card.addEventListener("click", () => openEditor(seq.id));
    grid.appendChild(card);
  });
  updateCounts();
}

function updateCounts() {
  const c = { all: state.sequences.length, draft: 0, progress: 0, scheduled: 0, published: 0 };
  state.sequences.forEach(s => c[s.status]++);
  document.querySelectorAll(".tab").forEach(t => {
    const k = t.dataset.filter;
    t.querySelector(".count").textContent = c[k] ?? 0;
  });
}

/* ---------------------------------------------------------------------------
 *  EDITOR
 * ------------------------------------------------------------------------- */
let editorCanvas;

function openEditor(id) {
  state.active = state.sequences.find(s => s.id === id);
  state.current = 0;
  $("#editorTitle").value = state.active.title;
  $("#statusSelect").value = state.active.status;
  $("#overlay").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  renderThumbs();
  drawEditor();
}

function closeEditor() {
  $("#overlay").classList.add("hidden");
  document.body.style.overflow = "";
  state.active = null;
  renderGrid();
}

function renderThumbs() {
  const box = $("#thumbs");
  box.innerHTML = "";
  state.active.slides.forEach((slide, i) => {
    const t = document.createElement("button");
    t.className = "thumb" + (i === state.current ? " active" : "");
    const cv = document.createElement("canvas");
    cv.width = 90; cv.height = 160;
    drawSlide(cv.getContext("2d"), slide, cv.width, cv.height);
    t.appendChild(cv);
    const span = document.createElement("span");
    span.textContent = slide.def.name;
    t.appendChild(span);
    t.addEventListener("click", () => { state.current = i; renderThumbs(); drawEditor(); });
    box.appendChild(t);
  });
}

function refreshActiveThumb() {
  const cv = $("#thumbs").children[state.current]?.querySelector("canvas");
  if (cv) drawSlide(cv.getContext("2d"), state.active.slides[state.current], cv.width, cv.height);
}

function renderTextPanel() {
  const slide = state.active.slides[state.current];
  $("#slideName").textContent = slide.def.name;
  const panel = $("#textPanel");
  panel.innerHTML = "";
  slide.def.texts.forEach(t => {
    const wrap = document.createElement("label");
    wrap.className = "field";
    wrap.innerHTML = `<span>${t.label}</span>`;
    const multi = (slide.texts[t.id] || "").length > 22 || t.lineHeight;
    const input = document.createElement(multi ? "textarea" : "input");
    if (multi) input.rows = 2;
    input.value = slide.texts[t.id];
    input.addEventListener("input", () => {
      slide.texts[t.id] = input.value;
      drawEditor();
      refreshActiveThumb();
    });
    wrap.appendChild(input);
    panel.appendChild(wrap);
  });
}

function drawEditor() {
  drawSlide(ctx(), state.active.slides[state.current], CANVAS_W, CANVAS_H);
  renderTextPanel();
}

/* ---------------------------------------------------------------------------
 *  Render del lienzo (motor)
 * ------------------------------------------------------------------------- */
function drawSlide(c, slide, w, h) {
  const scale = w / CANVAS_W;
  c.clearRect(0, 0, w, h);

  const imgObj = slide.imageIndex >= 0 ? state.images[slide.imageIndex] : null;
  if (imgObj) drawCover(c, imgObj.img, w, h);
  else drawPlaceholder(c, w, h);

  drawOverlay(c, slide.def.overlay, w, h);
  slide.def.texts.forEach(t => drawText(c, t, slide.texts[t.id], scale));
}

function drawCover(c, img, w, h) {
  const ir = img.width / img.height, tr = w / h;
  let dw, dh, dx, dy;
  if (ir > tr) { dh = h; dw = h * ir; dx = (w - dw) / 2; dy = 0; }
  else { dw = w; dh = w / ir; dx = 0; dy = (h - dh) / 2; }
  c.drawImage(img, dx, dy, dw, dh);
}

function drawPlaceholder(c, w, h) {
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#2a211b");
  g.addColorStop(1, "#15110d");
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

function drawOverlay(c, type, w, h) {
  if (type === "none") return;
  let g;
  if (type === "bottom") {
    g = c.createLinearGradient(0, h * 0.45, 0, h);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.80)");
  } else if (type === "top") {
    g = c.createLinearGradient(0, 0, 0, h * 0.55);
    g.addColorStop(0, "rgba(0,0,0,0.80)"); g.addColorStop(1, "rgba(0,0,0,0)");
  } else {
    g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(0,0,0,0.55)"); g.addColorStop(0.5, "rgba(0,0,0,0.30)"); g.addColorStop(1, "rgba(0,0,0,0.66)");
  }
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

function drawText(c, def, value, scale) {
  if (!value) return;
  let text = def.transform === "uppercase" ? value.toUpperCase() : value;
  const size = def.size * scale, x = def.x * scale, y = def.y * scale;
  const maxW = def.maxWidth * scale, lh = (def.lineHeight || 1.15) * size;
  const track = def.track ? def.track * scale : 0;

  c.font = `${def.weight || 600} ${size}px ${state.font}`;
  c.textAlign = def.align || "center";
  c.textBaseline = "middle";
  c.fillStyle = def.accent ? state.accent : (def.color || "#fff");
  c.shadowColor = "rgba(0,0,0,0.45)";
  c.shadowBlur = size * 0.18;
  c.shadowOffsetY = size * 0.04;

  const lines = wrapText(c, text, maxW, track);
  let cy = y - ((lines.length - 1) * lh) / 2;
  lines.forEach(line => {
    if (track) drawTracked(c, line, x, cy, track, def.align);
    else c.fillText(line, x, cy);
    cy += lh;
  });
  c.shadowColor = "transparent"; c.shadowBlur = 0; c.shadowOffsetY = 0;
}

function wrapText(c, text, maxW, track) {
  const out = [];
  text.split("\n").forEach(par => {
    let line = "";
    par.split(" ").forEach(word => {
      const test = line ? line + " " + word : word;
      if (measure(c, test, track) > maxW && line) { out.push(line); line = word; }
      else line = test;
    });
    out.push(line);
  });
  return out;
}

function measure(c, t, track) {
  let w = c.measureText(t).width;
  if (track) w += track * Math.max(0, t.length - 1);
  return w;
}

function drawTracked(c, text, x, y, track, align) {
  const total = measure(c, text, track);
  let sx = x;
  if (align === "center") sx = x - total / 2;
  else if (align === "right") sx = x - total;
  const prev = c.textAlign;
  c.textAlign = "left";
  let cx = sx;
  for (const ch of text) { c.fillText(ch, cx, y); cx += c.measureText(ch).width + track; }
  c.textAlign = prev;
}

/* ---------------------------------------------------------------------------
 *  Descargas
 * ------------------------------------------------------------------------- */
function blobDownload(canvas, name) {
  return new Promise(res => canvas.toBlob(b => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = name;
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); res(); }, 400);
  }, "image/jpeg", 0.92));
}

async function downloadAll() {
  const off = document.createElement("canvas");
  off.width = CANVAS_W; off.height = CANVAS_H;
  const oc = off.getContext("2d");
  const base = state.active.title.replace(/[^\w]+/g, "-").slice(0, 24) || "story";
  for (let i = 0; i < state.active.slides.length; i++) {
    drawSlide(oc, state.active.slides[i], CANVAS_W, CANVAS_H);
    await blobDownload(off, `${base}-${i + 1}.jpg`);
  }
}

/* ---------------------------------------------------------------------------
 *  Plantillas (modal "Nueva secuencia")
 * ------------------------------------------------------------------------- */
function openTemplateModal() {
  const box = $("#tplList");
  box.innerHTML = "";
  Object.entries(TEMPLATES).forEach(([key, tpl]) => {
    const b = document.createElement("button");
    b.className = "tpl-card";
    b.innerHTML = `<strong>${tpl.name}</strong><span>${tpl.description}</span><em>${tpl.slides.length} stories</em>`;
    b.addEventListener("click", () => {
      const seq = buildSequence({ title: tpl.name.replace(/^[^\s]+\s/, ""), template: key, status: "draft" });
      state.sequences.unshift(seq);
      $("#tplModal").classList.add("hidden");
      renderGrid();
      openEditor(seq.id);
    });
    box.appendChild(b);
  });
  $("#tplModal").classList.remove("hidden");
}

/* ---------------------------------------------------------------------------
 *  Eventos
 * ------------------------------------------------------------------------- */
function bind() {
  editorCanvas = $("#editorCanvas");

  // Upload (sidebar + editor)
  ["#fileInput", "#fileInput2"].forEach(sel => {
    const el = $(sel);
    if (el) el.addEventListener("change", e => loadFiles(e.target.files));
  });
  $("#uploadBtn").addEventListener("click", () => $("#fileInput").click());
  const drop = $("#editorDrop");
  drop.addEventListener("click", () => $("#fileInput2").click());
  ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("hover"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("hover"); }));
  drop.addEventListener("drop", e => loadFiles(e.dataTransfer.files));

  // Tabs
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    state.filter = t.dataset.filter;
    renderGrid();
  }));

  // New sequence
  $("#newSeq").addEventListener("click", openTemplateModal);
  $("#tplClose").addEventListener("click", () => $("#tplModal").classList.add("hidden"));
  $("#tplModal").addEventListener("click", e => { if (e.target.id === "tplModal") $("#tplModal").classList.add("hidden"); });

  // Editor controls
  $("#editorClose").addEventListener("click", closeEditor);
  $("#editorTitle").addEventListener("input", e => { state.active.title = e.target.value; });
  $("#statusSelect").addEventListener("change", e => { state.active.status = e.target.value; });
  $("#accentColor").addEventListener("input", e => { state.accent = e.target.value; drawEditor(); renderThumbs(); });
  $("#fontSelect").addEventListener("change", e => { state.font = e.target.value; drawEditor(); renderThumbs(); });

  $("#shuffleAll").addEventListener("click", () => { assignRandomImages(state.active); drawEditor(); renderThumbs(); });
  $("#newImg").addEventListener("click", () => {
    const n = state.images.length;
    if (n <= 1) return;
    const slide = state.active.slides[state.current];
    let next; do { next = Math.floor(Math.random() * n); } while (next === slide.imageIndex);
    slide.imageIndex = next; drawEditor(); refreshActiveThumb();
  });

  $("#dlOne").addEventListener("click", () => blobDownload(editorCanvas, `story-${state.current + 1}.jpg`));
  $("#dlAll").addEventListener("click", downloadAll);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("#overlay").classList.contains("hidden")) closeEditor();
  });
}

/* ---------------------------------------------------------------------------
 *  Arranque
 * ------------------------------------------------------------------------- */
function init() {
  bind();
  state.inbox = SEED_INBOX.map(x => ({ ...x }));
  state.sequences = SEED_SEQUENCES.map(s => buildSequence(s));
  $("#accentColor").value = state.accent;
  renderInbox();
  renderGrid();
  updateImgCount();
}

document.addEventListener("DOMContentLoaded", init);
