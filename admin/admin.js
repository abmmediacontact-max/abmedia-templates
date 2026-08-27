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
  // Vuelve a la sección donde estabas al recargar
  let guardada = "review";
  try { guardada = localStorage.getItem("abmedia_admin_vista") || "review"; } catch {}
  setView(["review", "pending", "biblio", "users"].includes(guardada) ? guardada : "review");
  // el contador del menú se actualiza aunque estés en otra sección
  fetchUsuariosRegistrados({ refrescar: true })
    .then(l => pintarContadorPendientes(l.filter(u => !u.aprobado).length));
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
  try { localStorage.setItem("abmedia_admin_vista", v); } catch {}
  $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.view === v));
  ["pending", "users", "biblio", "review"].forEach(x => $("#view-" + x).classList.toggle("hidden", x !== v));
  if (v === "pending") renderPending();
  else if (v === "users") renderUsers();
  else if (v === "biblio") renderBiblioteca();
  else if (v === "review") renderReview();
}

/* --------------------- Pendientes de aprobación ---------------------- *
 * admin_usuarios() cruza quién se ha registrado con la lista de acceso.
 * La base de datos sólo responde si quien pregunta es admin.
 * ---------------------------------------------------------------------*/
let _usuariosCache = null;

async function fetchUsuariosRegistrados({ refrescar = false } = {}) {
  if (_usuariosCache && !refrescar) return _usuariosCache;
  const { data, error } = await sb.rpc("admin_usuarios");
  if (error) { console.error("admin_usuarios", error); return []; }
  _usuariosCache = data || [];
  return _usuariosCache;
}

function pintarContadorPendientes(n) {
  const b = $("#pendingBadge");
  if (!b) return;
  b.textContent = n;
  b.classList.toggle("hidden", n === 0);
}

async function renderPending() {
  const cont = $("#pendingList");
  cont.innerHTML = `<p class="empty">Cargando…</p>`;
  const todos = await fetchUsuariosRegistrados({ refrescar: true });
  const pendientes = todos.filter(u => !u.aprobado);
  pintarContadorPendientes(pendientes.length);

  if (!pendientes.length) {
    cont.innerHTML = `<p class="empty">No hay nadie esperando. Todos los registrados tienen acceso.</p>`;
    return;
  }
  cont.innerHTML = "";
  pendientes.forEach(u => cont.appendChild(filaPendiente(u)));
}

function filaPendiente(u) {
  const fila = document.createElement("div");
  fila.className = "user-row pending-row";
  const desde = u.creado ? new Date(u.creado).toLocaleDateString("es-ES") : "—";
  const dias = u.creado
    ? Math.floor((Date.now() - new Date(u.creado).getTime()) / 86400000)
    : null;
  const espera = dias === null ? "" : dias === 0 ? "hoy" : dias === 1 ? "hace 1 día" : `hace ${dias} días`;
  const sinConfirmar = u.confirmado ? "" : `<span class="pend-warn">sin confirmar</span>`;

  fila.innerHTML =
    `<span class="em">${escapeHtml(u.email)}</span>` +
    `<span class="nt">Se registró ${escapeHtml(espera)} ${sinConfirmar}</span>` +
    `<span class="when">${desde}</span>` +
    `<button class="btn btn-primary xs" data-act="dar-acceso">Dar acceso</button>`;

  fila.querySelector('[data-act="dar-acceso"]').addEventListener("click", async e => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = "Dando acceso…";
    const { error } = await sb.from("allowed_users")
      .insert({ email: u.email.toLowerCase(), notes: "Aprobado desde Pendientes" });
    if (error) {
      console.error(error);
      alert("No se ha podido dar acceso: " + error.message);
      btn.disabled = false; btn.textContent = "Dar acceso";
      return;
    }
    _usuariosCache = null;
    renderPending();
  });
  return fila;
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
    _usuariosCache = null;
    row.remove();
  });
  return row;
}
async function addUser() {
  const e = $("#newUserEmail").value.trim().toLowerCase();
  const n = $("#newUserNotes").value.trim();
  if (!e) return;
  const { error } = await sb.from("allowed_users").insert({ email: e, notes: n || null });
  _usuariosCache = null;
  if (error) { alert("Error: " + error.message); return; }
  $("#newUserEmail").value = ""; $("#newUserNotes").value = "";
  renderUsers();
}

/* --------------------- Todas las secuencias ------------------------ */

/* Abre un frame a tamaño completo: en la revisión hay que poder leer los
   textos, y en miniatura no se distinguen. */
function abrirFrameGrande(src, indice, total) {
  let v = document.getElementById("frameViewer");
  if (!v) {
    v = document.createElement("div");
    v.id = "frameViewer";
    v.className = "frame-viewer hidden";
    v.innerHTML = `
      <button class="fv-cerrar" id="fvClose" aria-label="Cerrar">✕</button>
      <button class="fv-nav fv-prev" id="fvPrev" aria-label="Anterior">‹</button>
      <img id="fvImg" alt="" />
      <button class="fv-nav fv-next" id="fvNext" aria-label="Siguiente">›</button>
      <span class="fv-contador" id="fvCount"></span>`;
    document.body.appendChild(v);
    v.querySelector("#fvClose").addEventListener("click", () => v.classList.add("hidden"));
    v.addEventListener("click", e => { if (e.target === v) v.classList.add("hidden"); });
    document.addEventListener("keydown", e => {
      if (v.classList.contains("hidden")) return;
      if (e.key === "Escape") v.classList.add("hidden");
      if (e.key === "ArrowLeft")  v.querySelector("#fvPrev").click();
      if (e.key === "ArrowRight") v.querySelector("#fvNext").click();
    });
  }
  const pintar = i => {
    const lista = v._urls || [];
    const n = ((i % lista.length) + lista.length) % lista.length;
    v._i = n;
    v.querySelector("#fvImg").src = lista[n];
    v.querySelector("#fvCount").textContent = `${n + 1} / ${lista.length}`;
    v.querySelector("#fvPrev").classList.toggle("hidden", lista.length < 2);
    v.querySelector("#fvNext").classList.toggle("hidden", lista.length < 2);
  };
  v._urls = total;
  v.querySelector("#fvPrev").onclick = e => { e.stopPropagation(); pintar(v._i - 1); };
  v.querySelector("#fvNext").onclick = e => { e.stopPropagation(); pintar(v._i + 1); };
  pintar(indice);
  v.classList.remove("hidden");
}

async function openPreview(seq, row) {
  let m = $("#previewModal");
  if (!m) {
    m = document.createElement("div");
    m.id = "previewModal";
    m.className = "modal preview-modal hidden";
    m.innerHTML = `<div class="modal-box">
      <div class="modal-head"><h2 id="pmTitle">Secuencia</h2><button class="icon-btn" id="pmClose">✕</button></div>
      <div class="meta-row" id="pmMeta"></div>
      <div class="frames-row" id="pmFrames"></div>
      <p class="pm-pista">Pulsa un frame para verlo a pantalla completa.</p>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener("click", e => { if (e.target.id === "previewModal") m.classList.add("hidden"); });
    m.querySelector("#pmClose").addEventListener("click", () => m.classList.add("hidden"));
  }
  m.querySelector("#pmTitle").textContent = seq.title;
  const cat = CATEGORIES[seq.category] || CATEGORIES.venta;
  m.querySelector("#pmMeta").innerHTML = `<span class="pill">${cat.name}</span><span>${seq.slides.length} frames</span>`;
  const fr = m.querySelector("#pmFrames");
  fr.innerHTML = `<p class="empty">Cargando frames…</p>`;
  m.classList.remove("hidden");

  // Las vistas previas llevan las fotos del cliente: es lo que hay que
  // juzgar. Si el envío es anterior a esto, se dibuja sólo el texto.
  let urls = [];
  if (row && row.id && row.owner && window.sbRevision) {
    try { urls = await sbRevision.sbVistasPrevias(row.owner, row.id); } catch {}
  }

  fr.innerHTML = "";
  if (urls.length) {
    urls.forEach((u, i) => {
      const im = document.createElement("img");
      im.className = "frame-img";
      im.src = u; im.alt = "";
      im.loading = "lazy";
      im.title = "Ver a pantalla completa";
      im.addEventListener("click", () => abrirFrameGrande(u, i, urls));
      fr.appendChild(im);
    });
  } else {
    const nota = document.createElement("p");
    nota.className = "sin-fotos";
    nota.textContent = "Este envío es anterior a las vistas previas: sólo se ve el texto.";
    fr.appendChild(nota);
    seq.slides.forEach(sl => {
      const cv = document.createElement("canvas"); cv.width = 270; cv.height = 480;
      drawSlide(cv.getContext("2d"), sl, cv.width, cv.height, seq.style);
      fr.appendChild(cv);
    });
  }
}

/* -------------------- Plantillas pendientes ------------------------ */
/* --------------------------- Biblioteca -------------------------------- *
 * Lo que está publicado para todos. Desde aquí se retoca o se retira: antes,
 * una vez publicada una secuencia no había forma de tocarla.
 * ----------------------------------------------------------------------- */
let _biblio = null;              // lo traído de la base de datos
state.biblioCat = "todas";
state.biblioBusca = "";

async function renderBiblioteca({ refrescar = true } = {}) {
  const grid = $("#biblioGrid");
  if (refrescar || !_biblio) {
    grid.innerHTML = `<p class="empty">Cargando…</p>`;
    _biblio = await sbDB.sbFetchTemplates("public");
  }
  pintarFiltrosBiblio();

  const q = (state.biblioBusca || "").trim().toLowerCase();
  const lista = _biblio.filter(r => {
    if (state.biblioCat !== "todas" && r.category !== state.biblioCat) return false;
    if (q && !(r.title || "").toLowerCase().includes(q)) return false;
    return true;
  });

  $("#biblioCount").textContent =
    lista.length === _biblio.length
      ? `${_biblio.length} ${_biblio.length === 1 ? "secuencia" : "secuencias"}`
      : `${lista.length} de ${_biblio.length}`;

  grid.innerHTML = "";
  if (!_biblio.length) {
    grid.innerHTML = `<p class="empty">Todavía no hay ninguna secuencia en la biblioteca.</p>`;
    return;
  }
  if (!lista.length) {
    grid.innerHTML = `<p class="empty">Ninguna secuencia coincide con esa búsqueda.</p>`;
    return;
  }
  lista.forEach(row => grid.appendChild(tarjetaBiblioteca(row)));
}

function pintarFiltrosBiblio() {
  const box = $("#biblioCats");
  if (box.dataset.listo) {
    $$("#biblioCats .seg").forEach(b =>
      b.classList.toggle("active", b.dataset.cat === state.biblioCat));
    return;
  }
  const cuenta = k => _biblio.filter(r => r.category === k).length;
  box.innerHTML =
    `<button class="seg active" data-cat="todas">Todas</button>` +
    Object.entries(CATEGORIES)
      .map(([k, c]) => `<button class="seg" data-cat="${k}">${c.name} <em>${cuenta(k)}</em></button>`)
      .join("");
  $$("#biblioCats .seg").forEach(b => b.addEventListener("click", () => {
    state.biblioCat = b.dataset.cat;
    renderBiblioteca({ refrescar: false });
  }));
  let t = null;
  $("#biblioBuscar").addEventListener("input", e => {
    clearTimeout(t);
    const v = e.target.value;
    t = setTimeout(() => { state.biblioBusca = v; renderBiblioteca({ refrescar: false }); }, 180);
  });
  box.dataset.listo = "1";
}

function tarjetaBiblioteca(row) {
  const seq = {
    title: row.title || "Secuencia",
    category: row.category || "venta",
    style: { ...DEFAULT_STYLE, ...(row.style || {}) },
    slides: (row.slides || []).map(s => ({ ...s, bg: s.bg || { zoom: 1, ox: 0, oy: 0 }, bgIndex: -1, inset: null }))
  };
  const cat = CATEGORIES[seq.category] || CATEGORIES.venta;

  const card = document.createElement("div");
  card.className = "card admin-card";
  const cv = document.createElement("canvas");
  cv.width = 270; cv.height = 480; cv.className = "card-canvas";
  if (seq.slides[0]) drawSlide(cv.getContext("2d"), seq.slides[0], cv.width, cv.height, seq.style);
  card.appendChild(cv);

  const badge = document.createElement("span");
  badge.className = "frames-badge";
  badge.textContent = `${seq.slides.length} frames`;
  card.appendChild(badge);

  const info = document.createElement("div");
  info.className = "card-info";
  info.innerHTML =
    `<div class="card-row"><h3>${escapeHtml(seq.title)}</h3><span class="cat-tag">${cat.name}</span></div>
     <div class="biblio-edit hidden">
       <label class="field"><span>Nombre</span><input type="text" class="be-titulo" value="${escapeAttr(seq.title)}" /></label>
       <label class="field"><span>Categoría</span>
         <select class="be-cat status-select">
           ${Object.entries(CATEGORIES).map(([k, c]) =>
             `<option value="${k}"${k === seq.category ? " selected" : ""}>${c.name}</option>`).join("")}
         </select>
       </label>
       <div class="comentario-row">
         <button class="btn btn-ghost" data-act="cancelar">Cancelar</button>
         <button class="btn btn-ghost" data-act="guardar">Guardar</button>
       </div>
     </div>
     <div class="biblio-tools">
       <button class="btn btn-ghost xs" data-act="ver">Ver frames</button>
       <button class="btn btn-ghost xs" data-act="editar">Editar</button>
       <button class="btn btn-ghost xs danger" data-act="quitar">Quitar</button>
     </div>`;

  const zona = info.querySelector(".biblio-edit");
  const tools = info.querySelector(".biblio-tools");

  info.querySelector('[data-act="ver"]').addEventListener("click", e => {
    e.stopPropagation(); openPreview(seq, row);
  });
  info.querySelector('[data-act="editar"]').addEventListener("click", e => {
    e.stopPropagation();
    zona.classList.remove("hidden"); tools.classList.add("hidden");
  });
  info.querySelector('[data-act="cancelar"]').addEventListener("click", e => {
    e.stopPropagation();
    zona.classList.add("hidden"); tools.classList.remove("hidden");
  });
  info.querySelector('[data-act="guardar"]').addEventListener("click", async e => {
    e.stopPropagation();
    const titulo = info.querySelector(".be-titulo").value.trim();
    const categoria = info.querySelector(".be-cat").value;
    if (!titulo) { alert("Ponle un nombre."); return; }
    const { error } = await sb.from("templates")
      .update({ title: titulo, category: categoria }).eq("id", row.id);
    if (error) { console.error(error); alert("No se ha podido guardar."); return; }
    renderBiblioteca();
  });
  info.querySelector('[data-act="quitar"]').addEventListener("click", async e => {
    e.stopPropagation();
    if (!confirm(`¿Quitar "${seq.title}" de la biblioteca?\n\nDejará de estar disponible para tus clientes.`)) return;
    const { error } = await sb.from("templates").update({ is_public: false }).eq("id", row.id);
    if (error) { console.error(error); alert("No se ha podido quitar."); return; }
    renderBiblioteca();
  });

  card.appendChild(info);
  return card;
}

async function renderReview() {
  const grid = $("#reviewGrid"); grid.innerHTML = `<p class="empty">Cargando…</p>`;
  const items = await sbDB.sbFetchTemplates("review");
  grid.innerHTML = "";
  if (!items.length) { grid.innerHTML = `<p class="empty">No hay ninguna secuencia esperando revisión.</p>`; return; }
  const usuarios = await fetchUsuariosRegistrados();
  const porId = {};
  usuarios.forEach(u => { porId[u.id] = u.email; });
  items.forEach(row => grid.appendChild(tarjetaRevision(row, porId)));
}

function tarjetaRevision(row, emailsPorId) {
  const seq = {
    title: row.title || "Secuencia",
    category: row.category || "venta",
    style: { ...DEFAULT_STYLE, ...(row.style || {}) },
    slides: (row.slides || []).map(s => ({ ...s, bg: s.bg || { zoom: 1, ox: 0, oy: 0 }, bgIndex: -1, inset: null }))
  };
  const cat = CATEGORIES[seq.category] || CATEGORIES.venta;

  const card = document.createElement("div");
  card.className = "card admin-card review-card";

  const cv = document.createElement("canvas");
  cv.width = 270; cv.height = 480; cv.className = "card-canvas";
  if (seq.slides[0]) drawSlide(cv.getContext("2d"), seq.slides[0], cv.width, cv.height, seq.style);
  card.appendChild(cv);

  // Si el envío trae vistas previas, la miniatura es la foto real del
  // primer frame en vez del texto sobre un degradado.
  if (row.owner && row.id && window.sbRevision) {
    sbRevision.sbVistasPrevias(row.owner, row.id).then(urls => {
      if (!urls.length) return;
      const im = document.createElement("img");
      im.className = "card-canvas";
      im.src = urls[0]; im.alt = "";
      cv.replaceWith(im);
    }).catch(() => {});
  }

  const badge = document.createElement("span");
  badge.className = "frames-badge";
  badge.textContent = `${seq.slides.length} frames`;
  card.appendChild(badge);

  const quien = emailsPorId[row.owner] || "cliente";
  const permiso = row.share_ok
    ? `<span class="share-ok">Autoriza compartirla</span>`
    : `<span class="share-no">No autoriza compartirla</span>`;

  const info = document.createElement("div");
  info.className = "card-info";
  info.innerHTML =
    `<div class="card-row"><h3>${escapeHtml(seq.title)}</h3><span class="cat-tag">${cat.name}</span></div>
     <p class="card-obj">${escapeHtml(quien)}</p>
     <p class="card-obj">${permiso}</p>`;
  card.appendChild(info);

  const tools = document.createElement("div");
  tools.className = "review-tools";
  tools.innerHTML = `
    <button class="btn btn-ghost xs full" data-act="preview">Ver frames</button>
    <div class="verdicto">
      <button class="vbtn ok"       data-act="aprobar"  title="Está bien">
        <svg viewBox="0 0 24 24"><path d="M4 12.5 L9.5 18 L20 6.5"/></svg>
      </button>
      <button class="vbtn guardar"  data-act="publicar" title="Está bien y la añado a la biblioteca"${row.share_ok ? "" : " disabled"}>
        <svg viewBox="0 0 24 24"><path d="M4 12.5 L9.5 18 L20 6.5"/></svg>
        <svg class="v2" viewBox="0 0 24 24"><path d="M6 3 H18 V21 L12 16.5 L6 21 Z"/></svg>
      </button>
      <button class="vbtn ko"       data-act="cambios"  title="Hay cambios que hacer">
        <svg viewBox="0 0 24 24"><path d="M6 6 L18 18 M18 6 L6 18"/></svg>
      </button>
    </div>
    <div class="comentario hidden">
      <textarea rows="4" placeholder="Qué cambiarías. Ej: en el frame 1 añadiría…, el 2 lo quitaría, el CTA del 3 lo haría más directo."></textarea>
      <div class="comentario-row">
        <button class="btn btn-ghost" data-act="cancelar">Cancelar</button>
        <button class="btn btn-ghost" data-act="enviar-cambios">Enviar comentario</button>
      </div>
    </div>`;

  const zona = tools.querySelector(".comentario");
  const area = zona.querySelector("textarea");

  tools.querySelector('[data-act="preview"]').addEventListener("click", e => {
    e.stopPropagation(); openPreview(seq, row);
  });

  async function veredicto(estado, nota) {
    const res = await sbDB.sbRevisarTemplate(row.id, estado, nota);
    if (!res) { alert("No se ha podido guardar la revisión."); return; }
    // El email al cliente lo dispara la base de datos, no el navegador:
    // así la clave de envío no viaja nunca al front.
    renderReview();
  }

  tools.querySelector('[data-act="aprobar"]').addEventListener("click", e => {
    e.stopPropagation(); veredicto("aprobada", null);
  });
  tools.querySelector('[data-act="publicar"]').addEventListener("click", e => {
    e.stopPropagation();
    if (!row.share_ok) {
      alert("Este cliente no ha autorizado compartir esta secuencia en la biblioteca.");
      return;
    }
    veredicto("publicada", null);
  });
  tools.querySelector('[data-act="cambios"]').addEventListener("click", e => {
    e.stopPropagation();
    zona.classList.remove("hidden");
    area.focus();
  });
  tools.querySelector('[data-act="cancelar"]').addEventListener("click", e => {
    e.stopPropagation(); zona.classList.add("hidden"); area.value = "";
  });
  tools.querySelector('[data-act="enviar-cambios"]').addEventListener("click", e => {
    e.stopPropagation();
    const nota = area.value.trim();
    if (!nota) { alert("Escribe qué hay que cambiar: es lo que va a leer el cliente."); area.focus(); return; }
    veredicto("cambios", nota);
  });

  card.appendChild(tools);
  return card;
}

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

/* Supabase renueva la sesión cada cierto tiempo y avisa. Sin esta guarda el
   panel se arrancaba otra vez y te devolvía a la primera sección mientras
   estabas trabajando. */
let _arrancadoPara = null;

async function init() {
  bind(); bindLogin();
  sb.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) {
      if (_arrancadoPara === session.user.id) return;
      _arrancadoPara = session.user.id;
      await bootSession(session.user);
    } else {
      _arrancadoPara = null; state.user = null; showLogin();
    }
  });
  const s = await sbAuth.sbGetSession();
  if (s) {
    if (_arrancadoPara !== s.user.id) { _arrancadoPara = s.user.id; await bootSession(s.user); }
  } else showLogin();
}
document.addEventListener("DOMContentLoaded", init);
