/* =========================================================================
 *  ABMedia · Capa de Supabase (auth + base de datos)
 *  - Usa la clave "publishable" (segura para front-end).
 *  - La seguridad real va por RLS en Supabase (ver schema.sql).
 * ========================================================================= */

const SUPABASE_URL = "https://jiuhhnjpggdcjyjchxir.supabase.co";
const SUPABASE_KEY = "sb_publishable_tJVsAdsRgupt7cg2LOzWMg_vT6r0pFn";

// Emails con rol admin. Debe coincidir con is_admin() en la base de datos:
const ADMIN_EMAILS = ["alvarobautistaabmedia@gmail.com"];

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
window.sb = sb;
window.ADMIN_EMAILS = ADMIN_EMAILS;

/* ------------------------- Sesión / Auth helpers ------------------------ */

async function sbGetSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

async function sbSignIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function sbSignUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

async function sbSignOut() {
  await sb.auth.signOut();
}

function isAdmin(user) {
  if (!user) return false;
  return ADMIN_EMAILS.includes((user.email || "").toLowerCase());
}

/* ------------------------- Secuencias del usuario ----------------------- */

async function sbFetchSequences() {
  const { data, error } = await sb.from("sequences").select("*").order("updated_at", { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}

async function sbUpsertSequence(seq) {
  const row = {
    id: seq.cloudId,
    title: seq.title, category: seq.category, status: seq.status,
    submitted: !!seq.submitted,
    style: seq.style,
    slides: seq.slides.map(sl => ({ body: sl.body, pos: sl.pos, align: sl.align, overlay: sl.overlay, bg: sl.bg }))
  };
  if (!row.id) delete row.id;
  const { data, error } = await sb.from("sequences").upsert(row).select().single();
  if (error) { console.error("upsert seq", error); return null; }
  return data;
}

async function sbDeleteSequence(cloudId) {
  if (!cloudId) return;
  await sb.from("sequences").delete().eq("id", cloudId);
}

/* ------------------------- Plantillas ---------------------------------- */

async function sbFetchTemplates(scope = "mine") {
  // scope: "mine" => propias, "public" => aprobadas,
  //        "review" => admin: las que esperan veredicto
  let q = sb.from("templates").select("*").order("created_at", { ascending: false });
  if (scope === "public") q = q.eq("is_public", true);
  else if (scope === "review") q = q.eq("submitted", true).eq("review_status", "pendiente");
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}

async function sbUpsertTemplate(tpl) {
  const row = {
    id: tpl.cloudId || undefined,
    title: tpl.title, category: tpl.category,
    style: tpl.style, slides: tpl.slides,
    submitted: !!tpl.submitted, is_public: !!tpl.is_public
  };
  if (tpl.share_ok !== undefined) row.share_ok = !!tpl.share_ok;
  if (tpl.review_status) row.review_status = tpl.review_status;
  if (!row.id) delete row.id;
  const { data, error } = await sb.from("templates").upsert(row).select().single();
  if (error) { console.error("upsert tpl", error); return null; }
  return data;
}

async function sbDeleteTemplate(cloudId) {
  if (!cloudId) return;
  await sb.from("templates").delete().eq("id", cloudId);
}

/* Veredicto de ABMedia sobre una secuencia enviada.
 *   estado: "aprobada" | "publicada" | "cambios"
 *   nota:   comentario para el cliente (obligatorio si se piden cambios) */
async function sbRevisarTemplate(cloudId, estado, nota) {
  const cambios = {
    review_status: estado,
    review_note: nota || null,
    reviewed_at: new Date().toISOString(),
    seen_by_owner: false,
    is_public: estado === "publicada"
  };
  const { data, error } = await sb.from("templates")
    .update(cambios).eq("id", cloudId).select().single();
  if (error) { console.error("sbRevisarTemplate", error); return null; }
  return data;
}

/* Avisos del cliente: sus propios envíos ya revisados.
 * El filtro por dueño es imprescindible: las plantillas publicadas en la
 * biblioteca son visibles para todo el mundo, así que sin él cada cliente
 * vería en sus avisos las secuencias publicadas de los demás. */
async function sbFetchAvisos() {
  const { data: sesion } = await sb.auth.getUser();
  const uid = sesion && sesion.user ? sesion.user.id : null;
  if (!uid) return [];
  const { data, error } = await sb.from("templates")
    .select("id,title,category,review_status,review_note,reviewed_at,seen_by_owner")
    .eq("owner", uid)
    .neq("review_status", "pendiente")
    .order("reviewed_at", { ascending: false });
  if (error) { console.error("sbFetchAvisos", error); return []; }
  return data || [];
}

async function sbMarcarAvisoLeido(cloudId) {
  await sb.from("templates").update({ seen_by_owner: true }).eq("id", cloudId);
}

/* ---- Whitelist (allowed_users) ---- */
async function sbIsAllowed(email) {
  if (!email) return false;
  if (ADMIN_EMAILS.includes(email.toLowerCase())) return true;
  const { data, error } = await sb.from("allowed_users")
    .select("active").eq("email", email.toLowerCase()).maybeSingle();
  if (error) { console.warn("sbIsAllowed", error); return false; }
  return !!(data && data.active);
}

/* ---- Galería en la nube ----------------------------------------------- *
 * Las fotos viven en la carpeta del propio usuario dentro del bucket
 * "galeria". Las reglas de Supabase impiden entrar en la carpeta de otro.
 * Así la galería le sigue aunque cambie de ordenador.
 * ----------------------------------------------------------------------- */
const BUCKET = "galeria";

async function sbUidActual() {
  const { data } = await sb.auth.getUser();
  return data && data.user ? data.user.id : null;
}

// El nombre del fichero es la propia clave, saneada para que valga como ruta
function rutaDeFoto(uid, key) {
  return `${uid}/${encodeURIComponent(key).replace(/%/g, "_")}.jpg`;
}

async function sbSubirFoto(key, blob) {
  const uid = await sbUidActual();
  if (!uid) return null;
  const { error } = await sb.storage.from(BUCKET)
    .upload(rutaDeFoto(uid, key), blob, { upsert: true, contentType: "image/jpeg" });
  if (error) { console.warn("sbSubirFoto", error.message); return null; }
  return true;
}

async function sbListarFotos() {
  const uid = await sbUidActual();
  if (!uid) return [];
  const { data, error } = await sb.storage.from(BUCKET)
    .list(uid, { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
  if (error) { console.warn("sbListarFotos", error.message); return []; }
  return (data || []).filter(o => o.name && !o.name.startsWith("."));
}

async function sbDescargarFoto(nombre) {
  const uid = await sbUidActual();
  if (!uid) return null;
  const { data, error } = await sb.storage.from(BUCKET).download(`${uid}/${nombre}`);
  if (error) { console.warn("sbDescargarFoto", error.message); return null; }
  return data;
}

async function sbBorrarFoto(key) {
  const uid = await sbUidActual();
  if (!uid) return;
  await sb.storage.from(BUCKET).remove([rutaDeFoto(uid, key)]);
}

async function sbBorrarTodasLasFotos() {
  const uid = await sbUidActual();
  if (!uid) return;
  const fotos = await sbListarFotos();
  if (!fotos.length) return;
  await sb.storage.from(BUCKET).remove(fotos.map(f => `${uid}/${f.name}`));
}

window.sbFotos = { sbSubirFoto, sbListarFotos, sbDescargarFoto, sbBorrarFoto, sbBorrarTodasLasFotos, rutaDeFoto };

window.sbAuth = { sbGetSession, sbSignIn, sbSignUp, sbSignOut, isAdmin, sbIsAllowed };
window.sbDB = { sbFetchSequences, sbUpsertSequence, sbDeleteSequence, sbFetchTemplates, sbUpsertTemplate, sbDeleteTemplate, sbRevisarTemplate, sbFetchAvisos, sbMarcarAvisoLeido };
