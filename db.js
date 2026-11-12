// Capa de datos: usa Supabase si config.js tiene las claves; si no, el servidor local (server.js).
const config = window.PUFPU_CONFIG || {};
const cloud = config.supabaseUrl && config.supabaseAnonKey && window.supabase ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;

const ITEM_NUMERIC = ["stock", "price", "purchaseQty", "recipeGrams", "capacity"];
function normalizeItem(item) {
  item.category = ["ingrediente", "caja", "empaque"].includes(item.category) ? item.category : "ingrediente";
  item.unit = item.unit || (item.category === "ingrediente" ? "g" : "un");
  if (item.purchaseQty === undefined) item.purchaseQty = item.stock || 0;
  ITEM_NUMERIC.forEach(k => item[k] = Number(item[k]) || 0);
  item.size = String(item.size || "");
  item.name = String(item.name || "Ítem");
  return item;
}
function normalizeSale(sale) {
  return { ...sale, client: sale.client || "Cliente", product: sale.product || "Pedido", date: sale.date || new Date().toISOString().slice(0, 10), status: sale.status || "Pendiente", amount: Number(sale.amount) || 0, units: Number(sale.units) || 0, boxes: Number(sale.boxes) || 0, boxId: sale.boxId || "" };
}
function newId(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function check({ data, error }) { if (error) throw new Error(error.message); return data; }

// Traduce las rutas /api/... que usa app.js a consultas de Supabase.
async function cloudRequest(url, options = {}) {
  const method = options.method || "GET", body = options.body ? JSON.parse(options.body) : {};
  const [, , resource, id] = url.split("/");
  if (method === "GET" && resource === "data") {
    const [settings, items, sales] = await Promise.all([
      cloud.from("settings").select().eq("id", 1).maybeSingle(),
      cloud.from("items").select().order("created_at"),
      cloud.from("sales").select().order("created_at", { ascending: false })
    ].map(query => query.then(check)));
    return { settings: { cookiesPerBatch: Number(settings?.cookiesPerBatch) || 56 }, ingredients: items.map(normalizeItem), sales: sales.map(normalizeSale) };
  }
  if (resource === "settings") return check(await cloud.from("settings").upsert({ id: 1, cookiesPerBatch: Number(body.cookiesPerBatch) || 1 }).select().single());
  const table = resource === "ingredients" ? "items" : "sales", normalize = table === "items" ? normalizeItem : normalizeSale;
  if (method === "POST") return check(await cloud.from(table).insert(normalize({ ...body, id: newId(table === "items" ? "item" : "sale") })).select().single());
  if (method === "PUT") {
    const current = check(await cloud.from(table).select().eq("id", id).single());
    const { id: _ignored, created_at, ...changes } = body;
    return check(await cloud.from(table).update(normalize({ ...current, ...changes })).eq("id", id).select().single());
  }
  if (method === "DELETE") { check(await cloud.from(table).delete().eq("id", id)); return null; }
  throw new Error("Ruta no encontrada");
}

async function hasSession() { return !cloud || !!(await cloud.auth.getSession()).data.session; }
async function signIn(email, password) { check(await cloud.auth.signInWithPassword({ email, password })); }
async function signOut() { if (cloud) await cloud.auth.signOut(); location.reload(); }
