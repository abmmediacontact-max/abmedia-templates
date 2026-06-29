/* =========================================================================
 *  Panel admin — Sequence Builder · ABMedia
 * ========================================================================= */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = { user: null, isAdmin: false, view: "users" };

/* ------------------------------ Auth ------------------------------ */
async function bootSession(user) {
  state.user = user;
  state.isAdmin = sbAuth.isAdmin(user);
  if (!state.isAdmin) {
    $("#loginScreen").classList.add("hidden");
    $("#appRoot").classList.add("hidden");
    $("#notAdmin").classList.remove("hidden");
    return;
  }
  $("#loginScreen").classList.add("hidden");
  $("#notAdmin").classList.add("hidden");
  $("#appRoot").classList.remove("hidden");
  $("#userEmail").textContent = user.email || "";
  setView("users");
}
function showLogin() {
  $("#appRoot").classList.add("hidden");
  $("#notAdmin").classList.add("hidden");
  $("#loginScreen").classList.remove("hidden");
}
function bindLogin() {
  const err = $("#loginError");
  $("#loginBtn").addEventListener("click", async () => {
    err.textContent = "";
    const email = $("#loginEmail").value.trim();
    const pass = $("#loginPass").value;
    if (!email || !pass) { err.textContent = "Email y contraseña requeridos."; return; }
    try { await sbAuth.sbSignIn(email, pass); }
    catch (e) { err.textContent = e.message || "Error al iniciar sesión."; }
  });
  $("#logoutBtn").addEventListener("click", async () => { await sbAuth.sbSignOut(); });
  $("#naLogoutBtn").addEventListener("click", async () => { await sbAuth.sbSignOut(); });
}

/* ------------------------------ Vistas ----------------------------- */
function setView(v) {
  state.view = v;
  $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.view === v));
  ["users", "seqs", "review"].forEach(x => $("#view-" + x).classList.toggle("hidden", x !== v));
  if (v === "users") renderUsers();
  else if (v === "seqs") renderAllSequences();
  else if (v === "review") renderReview();
}

/* ------------------------------ Usuarios --------------------------- */
async function fetchUsers() {
  const { data, error } = await sb.from("allowed_users").select("*").order("granted_at", { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}
async function renderUsers() {
  const box = $("#usersList"); box.innerHTML = `<p class="empty">Cargando…</p>`;
  const rows = await fetchUsers();
  box.innerHTML = "";
  if (!rows.length) { box.innerHTML = `<p class="empty">No hay usuarios todavía. Añade el primero arriba.</p>`; return; }
  rows.forEach(r => box.appendChild(renderUserRow(r)));
}
function renderUserRow(r) {
  const row = document.createElement("div");
  row.className = "user-row" + (r.active ? "" : " inactive");
  const dt = new Date(r.granted_at).toLocaleDateString("es-ES");
  row.innerHTML = `
    <div class="em">${escapeHtml(r.email)}</div>
    <div class="nt"><input type="text" value="${escapeAttr(r.notes || "")}" placeholder="Notas (plan, contacto…)"/></div>
    <div class="when">desde ${dt}</div>
    <button class="toggle ${r.active ? "on" : ""}" title="Activo / pausado"></button>
    <button class="icon-btn danger" title="Eliminar">🗑</button>`;
  row.querySelector(".nt input").addEventListener("change", async e => {
    await sb.from("allowed_users").update({ notes: e.target.value || null }).eq("email", r.email);
  });
  row.querySelector(".toggle").addEventListener("click", async () => {
    const newVal = !r.active;
    const { error } = await sb.from("allowed_users").update({ active: newVal }).eq("email", r.email);
    if (!error) { r.active = newVal; row.classList.toggle("inactive", !newVal); row.querySelector(".toggle").classList.toggle("on", newVal); }
  });
  row.querySelector(".icon-btn").addEventListener("click", async () => {
    if (!confirm(`¿Quitar acceso a ${r.email}? No se borran sus secuencias.`)) return;
    await sb.from("allowed_users").delete().eq("email", r.email);
    row.remove();
  });
  return row;
}
async function addUser() {
  const e = $("#newUserEmail").value.trim().toLowerCase();
  const n = $("#newUserNotes").value.trim();
  if (!e) return;
  const { error } = await sb.from("allowed_users").insert({ email: e, notes: n || null });
  if (error) { alert("Error: " + error.message); return; }
  $("#newUserEmail").value = ""; $("#newUserNotes").value = "";
  renderUsers();
}

/* --------------------- Todas las secuencias ------------------------ */
async function fetchAllSequences() {
  // Admin RLS permite leer todo
  const { data, error } = await sb.from("sequences").select("*").order("updated_at", { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}
async function renderAllSequences() {
  const grid = $("#seqsGrid"); grid.innerHTML = `<p class="empty">Cargando…</p>`;
  const rows = await fetchAllSequences();
  $("#seqsCount").textContent = `${rows.length} secuencias`;
  grid.innerHTML = "";
  if (!rows.length) { grid.innerHTML = `<p class="empty">Aún no hay secuencias creadas.</p>`; return; }
  // Necesitamos sacar el email del owner — usamos auth.users vía RPC sería ideal,
  // pero por simplicidad mostramos uuid corto si no tenemos email.
  rows.forEach(r => grid.appendChild(makeSeqCard(r)));
}
function makeSeqCard(row) {
  const card = document.createElement("div"); card.className = "card admin-card";
  const seq = {
    title: row.title || "Secuencia",
    category: row.category || "venta",
    style: { ...DEFAULT_STYLE, ...(row.style || {}) },
    slides: (row.slides || []).map(s => ({ ...s, bg: s.bg || { zoom: 1, ox: 0, oy: 0 }, bgIndex: -1, inset: null }))
  };
  const cat = CATEGORIES[seq.category] || CATEGORIES.venta;
  const cv = document.createElement("canvas"); cv.width = 270; cv.height = 480; cv.className = "card-canvas";
  if (seq.slides[0]) drawSlide(cv.getContext("2d"), seq.slides[0], cv.width, cv.height, seq.style);
  card.appendChild(cv);
  const badge = document.createElement("span"); badge.className = "frames-badge"; badge.textContent = `${seq.slides.length} frames`;
  card.appendChild(badge);
  const info = document.createElement("div"); info.className = "card-info";
  const ownerShort = (row.owner || "").slice(0, 8);
  const when = new Date(row.updated_at).toLocaleDateString("es-ES");
  info.innerHTML = `<div class="card-row"><h3>${escapeHtml(seq.title)}</h3>
      <span class="cat-tag">${cat.name}</span></div>
      <p class="card-obj">Cliente <code>${ownerShort}</code> · ${when}</p>`;
  card.appendChild(info);
  const tools = document.createElement("div");
  tools.className = "mine-tools";
  tools.innerHTML = `
    <button class="btn btn-ghost xs" data-act="preview">Ver frames</button>
    <button class="btn btn-primary xs" data-act="promote">⭐ Plantilla</button>`;
  tools.querySelector('[data-act="preview"]').addEventListener("click", e => { e.stopPropagation(); openPreview(seq); });
  tools.querySelector('[data-act="promote"]').addEventListener("click", async e => {
    e.stopPropagation();
    const title = prompt("Nombre de la plantilla pública:", seq.title);
    if (!title) return;
    const cat = prompt("Categoría (personal / venta / puente):", seq.category) || seq.category;
    const tpl = {
      title, category: cat,
      style: seq.style,
      slides: seq.slides.map(sl => ({ body: sl.body, pos: sl.pos, align: sl.align, overlay: sl.overlay })),
      submitted: true, is_public: true
    };
    const { error } = await sb.from("templates").insert(tpl);
    if (error) { alert("Error: " + error.message); return; }
    alert("Plantilla pública creada. La verás en la Biblioteca de todos los clientes.");
  });
  card.appendChild(tools);
  card.addEventListener("click", () => openPreview(seq));
  return card;
}

function openPreview(seq) {
  let m = $("#previewModal");
  if (!m) {
    m = document.createElement("div");
    m.id = "previewModal";
    m.className = "modal preview-modal hidden";
    m.innerHTML = `<div class="modal-box">
      <div class="modal-head"><h2 id="pmTitle">Secuencia</h2><button class="icon-btn" id="pmClose">✕</button></div>
      <div class="meta-row" id="pmMeta"></div>
      <div class="frames-row" id="pmFrames"></div>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener("click", e => { if (e.target.id === "previewModal") m.classList.add("hidden"); });
    m.querySelector("#pmClose").addEventListener("click", () => m.classList.add("hidden"));
  }
  m.querySelector("#pmTitle").textContent = seq.title;
  const cat = CATEGORIES[seq.category] || CATEGORIES.venta;
  m.querySelector("#pmMeta").innerHTML = `<span class="pill">${cat.name}</span><span>${seq.slides.length} frames</span>`;
  const fr = m.querySelector("#pmFrames"); fr.innerHTML = "";
  seq.slides.forEach(sl => {
    const cv = document.createElement("canvas"); cv.width = 270; cv.height = 480;
    drawSlide(cv.getContext("2d"), sl, cv.width, cv.height, seq.style);
    fr.appendChild(cv);
  });
  m.classList.remove("hidden");
}

/* -------------------- Plantillas pendientes ------------------------ */
async function renderReview() {
  const grid = $("#reviewGrid"); grid.innerHTML = `<p class="empty">Cargando…</p>`;
  const items = await sbDB.sbFetchTemplates("review");
  grid.innerHTML = "";
  if (!items.length) { grid.innerHTML = `<p class="empty">No hay plantillas pendientes.</p>`; return; }
  items.forEach(row => {
    const seq = {
      title: row.title || "Plantilla",
      category: row.category || "venta",
      style: { ...DEFAULT_STYLE, ...(row.style || {}) },
      slides: (row.slides || []).map(s => ({ ...s, bg: s.bg || { zoom: 1, ox: 0, oy: 0 }, bgIndex: -1, inset: null }))
    };
    const cat = CATEGORIES[seq.category] || CATEGORIES.venta;
    const card = document.createElement("div"); card.className = "card admin-card";
    const cv = document.createElement("canvas"); cv.width = 270; cv.height = 480; cv.className = "card-canvas";
    if (seq.slides[0]) drawSlide(cv.getContext("2d"), seq.slides[0], cv.width, cv.height, seq.style);
    card.appendChild(cv);
    const badge = document.createElement("span"); badge.className = "frames-badge"; badge.textContent = `${seq.slides.length} frames`;
    card.appendChild(badge);
    const info = document.createElement("div"); info.className = "card-info";
    info.innerHTML = `<div class="card-row"><h3>${escapeHtml(seq.title)}</h3><span class="cat-tag">${cat.name}</span></div>
      <p class="card-obj">Enviada para revisión</p>`;
    card.appendChild(info);
    const tools = document.createElement("div"); tools.className = "mine-tools";
    tools.innerHTML = `
      <button class="btn btn-ghost xs" data-act="preview">Ver frames</button>
      <button class="btn btn-primary xs" data-act="approve">✅ Publicar</button>
      <button class="btn btn-ghost xs danger" data-act="reject">Rechazar</button>`;
    tools.querySelector('[data-act="preview"]').addEventListener("click", e => { e.stopPropagation(); openPreview(seq); });
    tools.querySelector('[data-act="approve"]').addEventListener("click", async e => {
      e.stopPropagation();
      await sbDB.sbApproveTemplate(row.id);
      renderReview();
    });
    tools.querySelector('[data-act="reject"]').addEventListener("click", async e => {
      e.stopPropagation();
      if (!confirm("¿Rechazar y borrar esta plantilla enviada?")) return;
      await sbDB.sbDeleteTemplate(row.id);
      renderReview();
    });
    card.appendChild(tools); grid.appendChild(card);
  });
}

/* -------------------- Render mínimo de slide ----------------------- */
const _images = []; // admin no tiene galería; los previews salen sin fotos
const SAFE = { top: 0.075, bottom: 0.82, left: 0.05, right: 0.95 };

function drawSlide(c, slide, w, h, style) {
  const scale = w / 1080;
  c.clearRect(0, 0, w, h);
  drawPlaceholder(c, w, h);
  drawOverlay(c, slide.overlay, w, h);
  drawBody(c, slide, style, scale, w, h);
}
function drawPlaceholder(c, w, h) {
  const grad = c.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#3a2a1c"); grad.addColorStop(1, "#1b1612");
  c.fillStyle = grad; c.fillRect(0, 0, w, h);
}
function drawOverlay(c, type, w, h) {
  if (type === "none") return;
  let g;
  if (type === "bottom") { g = c.createLinearGradient(0, h*0.4, 0, h); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.78)"); }
  else if (type === "soft") { c.fillStyle = "rgba(0,0,0,0.28)"; c.fillRect(0,0,w,h); return; }
  else { g = c.createLinearGradient(0,0,0,h); g.addColorStop(0,"rgba(0,0,0,0.45)"); g.addColorStop(0.5,"rgba(0,0,0,0.30)"); g.addColorStop(1,"rgba(0,0,0,0.62)"); }
  c.fillStyle = g; c.fillRect(0, 0, w, h);
}
function roundRect(c,x,y,w,h,r){ r=Math.min(r,w/2,h/2); c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
function tokenizeLine(line) {
  const segs = []; let hl=false, ul=false, ac=false, buf="";
  const flush = () => { if (buf) { segs.push({text:buf, hl, ul, ac}); buf=""; } };
  for (let i=0; i<line.length;) {
    const two = line.substr(i,2);
    if (two==="==") { flush(); hl=!hl; i+=2; continue; }
    if (two==="__") { flush(); ul=!ul; i+=2; continue; }
    if (two==="**") { flush(); ac=!ac; i+=2; continue; }
    buf += line[i++];
  }
  flush(); return segs;
}
function segsToWords(segs) {
  const w = [];
  segs.forEach(s => s.text.split(/\s+/).forEach(p => { if (p) w.push({text:p, hl:s.hl, ul:s.ul, ac:s.ac}); }));
  return w;
}
function drawBody(c, slide, style, scale, w, h) {
  const text = (slide.body || "").trim();
  if (!text) return;
  const size = 46 * style.size * scale;
  const lh = size * 1.34, parGap = size * 0.6;
  c.font = `${style.weight} ${size}px ${style.font}`;
  c.textAlign = "left"; c.textBaseline = "alphabetic";
  const left = (slide.pos?.x || 0.05) * w;
  const maxW = (0.95 - (slide.pos?.x || 0.05)) * w;
  const sp = c.measureText(" ").width;
  const layout = [];
  text.split("\n").forEach(par => {
    if (!par.trim()) { layout.push({gap:true}); return; }
    const fitted = [];
    segsToWords(tokenizeLine(par)).forEach(t => { t.w = c.measureText(t.text).width; fitted.push(t); });
    const lines = []; let line = [], lineW = 0;
    fitted.forEach(t => {
      const g = line.length ? sp : 0;
      if (lineW + g + t.w > maxW && line.length) { lines.push({words: line, width: lineW}); line = []; lineW = 0; t.x = 0; line.push(t); lineW = t.w; }
      else { t.x = lineW + g; line.push(t); lineW += g + t.w; }
    });
    if (line.length) lines.push({words: line, width: lineW});
    layout.push({lines});
  });
  let y = (slide.pos?.y || 0.085) * h + size;
  layout.forEach(b => {
    if (b.gap) { y += parGap; return; }
    b.lines.forEach(ln => {
      for (let i = 0; i < ln.words.length;) {
        if (ln.words[i].hl) {
          let j = i, sX = ln.words[i].x, eX = ln.words[i].x + ln.words[i].w;
          while (j < ln.words.length && ln.words[j].hl) { eX = ln.words[j].x + ln.words[j].w; j++; }
          const padX = size*0.16, padY = size*0.13;
          c.fillStyle = style.highlightColor;
          roundRect(c, left+sX-padX, y-size+size*0.06-padY, (eX-sX)+padX*2, size+padY*1.4, size*0.18); c.fill();
          i = j;
        } else i++;
      }
      ln.words.forEach(t => {
        c.fillStyle = t.hl ? style.highlightText : (t.ac ? style.highlightColor : style.textColor);
        if (!t.hl) { c.shadowColor = "rgba(0,0,0,0.5)"; c.shadowBlur = size*0.12; c.shadowOffsetY = size*0.025; }
        c.fillText(t.text, left + t.x, y);
        c.shadowColor = "transparent"; c.shadowBlur = 0; c.shadowOffsetY = 0;
      });
      for (let k = 0; k < ln.words.length;) {
        if (ln.words[k].ul) {
          let j = k, sX = ln.words[k].x, eX = ln.words[k].x + ln.words[k].w;
          while (j < ln.words.length && ln.words[j].ul) { eX = ln.words[j].x + ln.words[j].w; j++; }
          c.strokeStyle = style.highlightColor; c.lineWidth = size*0.07; c.lineCap = "round";
          c.beginPath(); c.moveTo(left + sX, y + size*0.17); c.lineTo(left + eX, y + size*0.17); c.stroke();
          k = j;
        } else k++;
      }
      y += lh;
    });
  });
}

function escapeHtml(s) { return (s||"").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
function escapeAttr(s) { return escapeHtml(s); }

/* ------------------------------- Init ------------------------------ */
function bind() {
  $$(".nav-item").forEach(n => n.addEventListener("click", () => setView(n.dataset.view)));
  $("#addUserBtn").addEventListener("click", addUser);
  $("#newUserEmail").addEventListener("keydown", e => { if (e.key === "Enter") addUser(); });
  $("#newUserNotes").addEventListener("keydown", e => { if (e.key === "Enter") addUser(); });
}

async function init() {
  bind(); bindLogin();
  sb.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) await bootSession(session.user);
    else { state.user = null; showLogin(); }
  });
  const s = await sbAuth.sbGetSession();
  if (s) await bootSession(s.user);
  else showLogin();
}
document.addEventListener("DOMContentLoaded", init);
