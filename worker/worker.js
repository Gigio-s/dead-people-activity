// Worker condiviso RV + DPA: codici RV, inventario D1 e PayPal server-side.
// Sconto del giorno: ogni giorno e' valida UNA sola categoria (rotazione).

const SITE_BASE = 'https://ramacciatovintage.it';
const DPA_CATALOG_URL = 'https://deadpeopleactivity.com/assets/data/store/catalogo-musica.json';
const CAT_FILES = ['musica','dvd','videogiochi','oggetti','elettronica','libri','trading'];

const SHIPPING = { italia: 5.90, europa: 12.90, pickup: 3.90 };
const FREE_ABOVE = 50.00;
const DPA_COUNTRIES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
  'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','GB','CH','NO','IS'
]);

// Codici sconto - 5% SOLO sugli articoli della categoria indicata.
const CODES = {
  'RV-GAME5':  { pct: 5, cat: 'videogiochi' },
  'RV-TECH5':  { pct: 5, cat: 'elettronica' },
  'RV-MUSIC5': { pct: 5, cat: 'musica' },
  'RV-LIBRI5': { pct: 5, cat: 'libri' },
  'RV-OGG5':   { pct: 5, cat: 'oggetti' },
  'RV-CARD5':  { pct: 5, cat: 'trading' },
  'RV-DVD5':   { pct: 5, cat: 'dvd' }
};

// Ordine rotazione "sconto del giorno" (DEVE combaciare con l'ordine CATS in index.html)
const ORDER = ['videogiochi','elettronica','musica','libri','oggetti','trading','dvd'];
// cat -> codice
const CAT_CODE = {};
for (const k in CODES) CAT_CODE[CODES[k].cat] = k;

function todayIndex(){ return Math.floor(Date.now() / 86400000) % ORDER.length; }
function todayCat(){ return ORDER[todayIndex()]; }

const ALLOWED_ORIGINS = [
  'https://ramacciatovintage.it',
  'https://www.ramacciatovintage.it',
  'https://deadpeopleactivity.com',
  'https://www.deadpeopleactivity.com'
];

function round2(n){ return Math.round((n + Number.EPSILON) * 100) / 100; }

function corsHeaders(origin){
  const isLocalPreview = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
  const allow = (ALLOWED_ORIGINS.includes(origin) || isLocalPreview) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

function json(data, status, origin){
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin))
  });
}

const CATALOG_CACHE = { rv: null, dpa: null };
const CATALOG_TS = { rv: 0, dpa: 0 };
async function loadCatalog(source){
  const channel = source === 'dpa' ? 'dpa' : 'rv';
  const now = Date.now();
  if (CATALOG_CACHE[channel] && (now - CATALOG_TS[channel]) < 60000)
    return CATALOG_CACHE[channel];
  const map = {};
  const urls = channel === 'dpa'
    ? [DPA_CATALOG_URL]
    : CAT_FILES.map(c => SITE_BASE + '/catalogo-' + c + '.json');
  await Promise.all(urls.map(async (catalogUrl) => {
    try {
      const r = await fetch(catalogUrl, { cf: { cacheTtl: 60 } });
      if (!r.ok) return;
      const arr = await r.json();
      if (Array.isArray(arr)) {
        for (const p of arr) { if (p && p.id != null) map[String(p.id)] = p; }
      }
    } catch (e) {}
  }));
  CATALOG_CACHE[channel] = map;
  CATALOG_TS[channel] = now;
  return map;
}

function cents(n){ return Math.round((Number(n) || 0) * 100); }
function money(n){ return round2((Number(n) || 0) / 100); }

function productMetadata(row){
  try { return JSON.parse(row.metadata_json || '{}'); } catch(e) { return {}; }
}

function isHidden(row){
  const metadata = productMetadata(row);
  return metadata.nascosto === true || metadata.nascosto === 1 || metadata.nascosto === '1';
}

function isAdmin(request, env, url){
  if (!env.ADMIN_API_TOKEN) return false;
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return bearer === env.ADMIN_API_TOKEN || url.searchParams.get('token') === env.ADMIN_API_TOKEN;
}

async function d1Product(env, id){
  if (!env.INVENTORY_DB) return null;
  return await env.INVENTORY_DB.prepare(
    'SELECT id, category, name, price_cents, stock, reserved, publish_rv, publish_dpa, metadata_json ' +
    'FROM products WHERE id=?'
  ).bind(String(id)).first();
}

async function computeTotals(body, env){
  const items = Array.isArray(body.items) ? body.items : [];
  const source = body.source === 'dpa' ? 'dpa' : 'rv';
  const zona = source === 'dpa'
    ? (body.zona === 'europa' ? 'europa' : 'italia')
    : (SHIPPING[body.zona] != null ? body.zona : 'italia');
  const codeRaw = source === 'dpa' ? '' : (body.code || '').trim().toUpperCase();
  const catalog = env && env.INVENTORY_DB ? null : await loadCatalog(source);

  let subtotal = 0;
  const lines = [];
  for (const it of items) {
    const central = env && env.INVENTORY_DB ? await d1Product(env, it.id) : null;
    if (source === 'dpa' && central && (
      !central || Number(central.publish_dpa) !== 1 || central.category !== 'musica' || isHidden(central))) {
      const err = new Error('Articolo DPA non disponibile');
      err.code = 'stock';
      throw err;
    }
    if (source === 'rv' && central && Number(central.publish_rv) !== 1) continue;
    let p = central ? {
      id: central.id,
      name: central.name,
      cat: central.category,
      price: money(central.price_cents),
      copie: Math.max(0, Number(central.stock) - Number(central.reserved)),
      sold: Number(central.stock) <= 0
    } : (catalog ? catalog[String(it.id)] : null);
    if (!p || p.sold) {
      if (source === 'dpa') {
        const err = new Error('Articolo esaurito o non disponibile');
        err.code = 'stock';
        throw err;
      }
      continue;
    }
    const qty = source === 'dpa' ? Number(it.qty) : Math.max(1, parseInt(it.qty, 10) || 1);
    if (source === 'dpa' && (!Number.isInteger(qty) || qty < 1 || qty > 99)) {
      const err = new Error('Quantità non valida');
      err.code = 'stock';
      throw err;
    }
    const available = p.copie == null ? 1 : Math.max(0, parseInt(p.copie, 10) || 0);
    if (qty > available) {
      const err = new Error('Quantita non disponibile per ' + (p.name || p.id));
      err.code = 'stock';
      throw err;
    }
    const price = Number(p.price) || 0;
    const lineTotal = round2(price * qty);
    subtotal = round2(subtotal + lineTotal);
    lines.push({ id: p.id, name: p.name || 'Articolo', cat: p.cat, price: price, qty: qty, lineTotal: lineTotal });
  }

  // Sconto valido SOLO se il codice e' quello della categoria di oggi
  let discount = 0, categoria = null, codeValid = false, reason = null;
  if (codeRaw && CODES[codeRaw]) {
    const rule = CODES[codeRaw];
    if (rule.cat !== todayCat()) {
      reason = 'not-today';                 // codice esistente ma non e' lo sconto di oggi
    } else {
      categoria = rule.cat;
      let baseCat = 0;
      for (const l of lines) if (l.cat === rule.cat) baseCat = round2(baseCat + l.lineTotal);
      discount = round2(baseCat * rule.pct / 100);
      codeValid = discount > 0;
      if (!codeValid) reason = 'no-items';  // nessun articolo della categoria nel carrello
    }
  } else if (codeRaw) {
    reason = 'unknown';
  }

  let shipping = SHIPPING[zona];
  if (subtotal >= FREE_ABOVE) shipping = 0;

  const total = round2(subtotal + shipping - discount);
  return { lines, subtotal, discount, shipping, total, zona, reason,
           code: codeValid ? codeRaw : null, categoria: codeValid ? categoria : null };
}

function dpaShipping(value, zona){
  const shipping = value && typeof value === 'object' ? value : {};
  const fullName = String(shipping.name || '').trim();
  const address = String(shipping.address || '').trim();
  const city = String(shipping.city || '').trim();
  const postal = String(shipping.postal || '').trim();
  const country = String(shipping.country || '').trim().toUpperCase();
  const region = String(shipping.region || '').trim();
  if (!fullName || !address || !city || !postal || !DPA_COUNTRIES.has(country))
    throw new Error('Indirizzo di spedizione incompleto o Paese non supportato');
  if (zona !== (country === 'IT' ? 'italia' : 'europa'))
    throw new Error('Zona di spedizione non corrispondente al Paese');
  return {
    name: { full_name: fullName.slice(0, 300) },
    address: {
      address_line_1: address.slice(0, 300),
      admin_area_2: city.slice(0, 120),
      admin_area_1: region.slice(0, 120),
      postal_code: postal.slice(0, 60),
      country_code: country
    }
  };
}

async function syncProducts(env, products){
  if (!env.INVENTORY_DB) throw new Error('Inventario D1 non configurato');
  const rows = Array.isArray(products) ? products : [];
  // Una sincronizzazione completa non deve lasciare online ID rimossi dal gestionale.
  await env.INVENTORY_DB.prepare(
    'UPDATE products SET publish_rv=0,publish_dpa=0'
  ).run();
  const statements = [];
  for (const p of rows) {
    if (!p || p.id == null) continue;
    statements.push(env.INVENTORY_DB.prepare(
      `INSERT INTO products
       (id,category,name,price_cents,stock,reserved,publish_rv,publish_dpa,metadata_json,updated_at)
       VALUES(?,?,?,?,?,0,?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         category=excluded.category,
         name=excluded.name,
         price_cents=excluded.price_cents,
         stock=MIN(products.stock, excluded.stock),
         reserved=MIN(products.reserved, excluded.stock),
         publish_rv=excluded.publish_rv,
         publish_dpa=excluded.publish_dpa,
         metadata_json=excluded.metadata_json,
         updated_at=CURRENT_TIMESTAMP`
    ).bind(
      String(p.id), String(p.category || ''), String(p.name || 'Articolo'),
      Math.max(0, Number(p.priceCents) || 0), Math.max(0, Number(p.stock) || 0),
      p.publishRv ? 1 : 0, p.publishDpa ? 1 : 0,
      JSON.stringify(p.metadata || {})
    ));
  }
  const chunkSize = 75;
  for (let i = 0; i < statements.length; i += chunkSize)
    await env.INVENTORY_DB.batch(statements.slice(i, i + chunkSize));
  return statements.length;
}

async function publicProducts(env, channel, category){
  if (!env.INVENTORY_DB) {
    const catalog = await loadCatalog(channel);
    return Object.values(catalog).filter(product => !category || product.cat === category);
  }
  const flag = channel === 'dpa' ? 'publish_dpa' : 'publish_rv';
  let sql = `SELECT metadata_json, stock, reserved FROM products WHERE ${flag}=1`;
  const args = [];
  if (category) { sql += ' AND category=?'; args.push(category); }
  sql += ' ORDER BY updated_at DESC';
  const result = await env.INVENTORY_DB.prepare(sql).bind(...args).all();
  return (result.results || []).filter(row => !isHidden(row)).map(row => {
    const p = productMetadata(row);
    p.copie = Math.max(0, Number(row.stock) - Number(row.reserved));
    p.sold = p.copie <= 0;
    return p;
  });
}

async function releaseExpired(env){
  if (!env.INVENTORY_DB) return;
  const expired = await env.INVENTORY_DB.prepare(
    `SELECT order_id, product_id, quantity FROM reservations
     WHERE status='active' AND datetime(expires_at) <= CURRENT_TIMESTAMP`
  ).all();
  for (const r of expired.results || []) {
    await env.INVENTORY_DB.batch([
      env.INVENTORY_DB.prepare(
        'UPDATE products SET reserved=MAX(0,reserved-?) WHERE id=?'
      ).bind(r.quantity, r.product_id),
      env.INVENTORY_DB.prepare(
        `UPDATE reservations SET status='expired' WHERE order_id=? AND product_id=? AND status='active'`
      ).bind(r.order_id, r.product_id),
      env.INVENTORY_DB.prepare(
        `UPDATE orders SET status='expired',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='created'`
      ).bind(r.order_id)
    ]);
  }
}

async function reserveOrder(env, orderId, totals, source){
  if (!env.INVENTORY_DB) return;
  await releaseExpired(env);
  const reserved = [];
  try {
    for (const line of totals.lines) {
      const result = await env.INVENTORY_DB.prepare(
        `UPDATE products SET reserved=reserved+?,updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND stock-reserved>=?`
      ).bind(line.qty, String(line.id), line.qty).run();
      if (!result.meta || Number(result.meta.changes) !== 1)
        throw new Error('Articolo appena esaurito: ' + line.name);
      reserved.push(line);
    }
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const statements = [env.INVENTORY_DB.prepare(
      `INSERT INTO orders
       (order_id,source,status,shipping_zone,subtotal_cents,discount_cents,shipping_cents,total_cents,discount_code)
       VALUES(?,?,'created',?,?,?,?,?,?)`
    ).bind(orderId, source, totals.zona, cents(totals.subtotal), cents(totals.discount),
      cents(totals.shipping), cents(totals.total), totals.code)];
    for (const line of totals.lines) {
      statements.push(env.INVENTORY_DB.prepare(
        `INSERT INTO order_items(order_id,product_id,name,category,unit_price_cents,quantity)
         VALUES(?,?,?,?,?,?)`
      ).bind(orderId, String(line.id), line.name, line.cat, cents(line.price), line.qty));
      statements.push(env.INVENTORY_DB.prepare(
        `INSERT INTO reservations(order_id,product_id,quantity,status,expires_at)
         VALUES(?,?,?,'active',?)`
      ).bind(orderId, String(line.id), line.qty, expires));
    }
    await env.INVENTORY_DB.batch(statements);
  } catch (e) {
    for (const line of reserved) {
      await env.INVENTORY_DB.prepare(
        'UPDATE products SET reserved=MAX(0,reserved-?) WHERE id=?'
      ).bind(line.qty, String(line.id)).run();
    }
    throw e;
  }
}

function paypalCustomer(payload){
  const payer = payload.payer || {};
  const unit = (payload.purchase_units || [])[0] || {};
  const shipping = unit.shipping || {};
  const addr = shipping.address || {};
  const fullName = [payer.name && payer.name.given_name, payer.name && payer.name.surname]
    .filter(Boolean).join(' ') || shipping.name && shipping.name.full_name || '';
  const address = [addr.address_line_1, addr.address_line_2, addr.admin_area_2,
    addr.admin_area_1, addr.postal_code, addr.country_code].filter(Boolean).join(', ');
  const capture = (((unit.payments || {}).captures || [])[0]) || {};
  return { name: fullName, email: payer.email_address || '', address, captureId: capture.id || '' };
}

async function completeCentralOrder(env, orderId, payload){
  if (!env.INVENTORY_DB || payload.status !== 'COMPLETED') return;
  const existing = await env.INVENTORY_DB.prepare(
    'SELECT status FROM orders WHERE order_id=?'
  ).bind(orderId).first();
  if (!existing || existing.status === 'captured') return;
  const items = await env.INVENTORY_DB.prepare(
    `SELECT product_id,quantity FROM reservations WHERE order_id=? AND status='active'`
  ).bind(orderId).all();
  const customer = paypalCustomer(payload);
  const statements = [];
  for (const item of items.results || []) {
    statements.push(env.INVENTORY_DB.prepare(
      `UPDATE products SET stock=MAX(0,stock-?),reserved=MAX(0,reserved-?),updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(item.quantity, item.quantity, item.product_id));
    statements.push(env.INVENTORY_DB.prepare(
      `UPDATE reservations SET status='fulfilled' WHERE order_id=? AND product_id=?`
    ).bind(orderId, item.product_id));
  }
  statements.push(env.INVENTORY_DB.prepare(
    `UPDATE orders SET status='captured',customer_name=?,customer_email=?,shipping_address=?,
     paypal_capture_id=?,paypal_payload_json=?,captured_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
     WHERE order_id=?`
  ).bind(customer.name, customer.email, customer.address, customer.captureId,
    JSON.stringify(payload), orderId));
  await env.INVENTORY_DB.batch(statements);
}

async function listOrders(env){
  if (!env.INVENTORY_DB) throw new Error('Inventario D1 non configurato');
  const orders = await env.INVENTORY_DB.prepare(
    'SELECT * FROM orders ORDER BY created_at DESC LIMIT 500'
  ).all();
  const result = [];
  for (const o of orders.results || []) {
    const items = await env.INVENTORY_DB.prepare(
      'SELECT product_id AS id,name,category AS cat,unit_price_cents,quantity AS qty FROM order_items WHERE order_id=?'
    ).bind(o.order_id).all();
    result.push({
      orderId: o.order_id, data: o.created_at, nome: o.customer_name,
      email: o.customer_email, indirizzo: o.shipping_address, zona: o.shipping_zone,
      tot: money(o.total_cents), sconto: money(o.discount_cents), codice: o.discount_code,
      canale: o.source, stato: o.status,
      articoli: (items.results || []).map(i => ({...i, price: money(i.unit_price_cents)}))
    });
  }
  return result;
}

function ppBase(env){
  return (env.PAYPAL_ENV === 'sandbox')
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}
async function ppToken(env){
  const auth = btoa(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_SECRET);
  const r = await fetch(ppBase(env) + '/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('PayPal token error');
  return d.access_token;
}

async function createOrder(env, t, source, shipping){
  const token = await ppToken(env);
  const items = t.lines.map(l => ({
    name: String(l.name).substring(0, 127),
    quantity: String(l.qty),
    unit_amount: { currency_code: 'EUR', value: l.price.toFixed(2) },
    category: 'PHYSICAL_GOODS'
  }));
  const breakdown = {
    item_total: { currency_code: 'EUR', value: t.subtotal.toFixed(2) },
    shipping:   { currency_code: 'EUR', value: t.shipping.toFixed(2) }
  };
  if (t.discount > 0) breakdown.discount = { currency_code: 'EUR', value: t.discount.toFixed(2) };

  const purchaseUnit = {
    description: source === 'dpa' ? 'Dead People Activity - Ordine' : 'Ramacciato Vintage - Ordine',
    amount: { currency_code: 'EUR', value: t.total.toFixed(2), breakdown: breakdown },
    items: items
  };
  if (source === 'dpa') purchaseUnit.shipping = shipping;
  const context = { brand_name: source === 'dpa' ? 'Dead People Activity' : 'Ramacciato Vintage',
    locale: 'it-IT', user_action: 'PAY_NOW' };
  if (source === 'dpa') context.shipping_preference = 'SET_PROVIDED_ADDRESS';
  const r = await fetch(ppBase(env) + '/v2/checkout/orders', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [purchaseUnit],
      application_context: context
    })
  });
  const d = await r.json();
  if (!d.id) throw new Error('PayPal create error: ' + JSON.stringify(d));
  return d.id;
}

async function captureOrder(env, orderID){
  const token = await ppToken(env);
  const endpoint = ppBase(env) + '/v2/checkout/orders/' + encodeURIComponent(orderID);
  const existing = await fetch(endpoint, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (existing.ok) {
    const current = await existing.json();
    if (current.status === 'COMPLETED') return current;
  }
  const r = await fetch(endpoint + '/capture', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  });
  return await r.json();
}

export default {
  async fetch(request, env){
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders(origin) });

    // Sconto del giorno (GET) - per la ruota in home
    if (url.pathname === '/today') {
      const cat = todayCat();
      return json({ index: todayIndex(), cat: cat, code: CAT_CODE[cat] }, 200, origin);
    }

    if (request.method === 'GET' && url.pathname === '/checkout-capabilities') {
      const dpa = url.searchParams.get('channel') === 'dpa';
      const ready = Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET);
      return json({ ready, channel: dpa ? 'dpa' : 'rv' }, 200, origin);
    }

    if (request.method === 'GET' && url.pathname === '/products') {
      try {
        const channel = url.searchParams.get('channel') === 'dpa' ? 'dpa' : 'rv';
        const products = await publicProducts(env, channel, url.searchParams.get('category'));
        return json({ products, channel }, 200, origin);
      } catch (e) {
        return json({ error: String(e && e.message || e) }, 503, origin);
      }
    }

    if (request.method === 'GET' && url.pathname === '/orders') {
      if (!isAdmin(request, env, url)) return json({ error: 'non autorizzato' }, 401, origin);
      try {
        return json({ orders: await listOrders(env) }, 200, origin);
      } catch (e) {
        return json({ error: String(e && e.message || e) }, 503, origin);
      }
    }

    if (request.method !== 'POST')
      return json({ error: 'method' }, 405, origin);

    let body = {};
    try { body = await request.json(); } catch(e){ return json({ error: 'bad json' }, 400, origin); }

    try {
      if (url.pathname === '/admin/sync-products') {
        if (!isAdmin(request, env, url)) return json({ error: 'non autorizzato' }, 401, origin);
        const synced = await syncProducts(env, body.products);
        return json({ synced }, 200, origin);
      }
      if (url.pathname === '/quote') {
        const t = await computeTotals(body, env);
        return json({ subtotal: t.subtotal, discount: t.discount, shipping: t.shipping,
                      total: t.total, code: t.code, categoria: t.categoria, reason: t.reason }, 200, origin);
      }
      if (url.pathname === '/create-order') {
        if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET)
          return json({ error: 'PayPal non configurato' }, 500, origin);
        const source = body.source === 'dpa' ? 'dpa' : 'rv';
        const t = await computeTotals(body, env);
        if (!t.lines.length) return json({ error: 'carrello vuoto' }, 400, origin);
        const shipping = source === 'dpa' ? dpaShipping(body.shipping, t.zona) : null;
        const id = await createOrder(env, t, source, shipping);
        await reserveOrder(env, id, t, source);
        return json({ id: id, total: t.total, discount: t.discount }, 200, origin);
      }
      if (url.pathname === '/capture-order') {
        if (!body.orderID) return json({ error: 'orderID mancante' }, 400, origin);
        if (body.source === 'dpa' && env.INVENTORY_DB) {
          const order = await env.INVENTORY_DB.prepare(
            'SELECT source,status,paypal_payload_json FROM orders WHERE order_id=?'
          ).bind(String(body.orderID)).first();
          if (!order || order.source !== 'dpa')
            return json({ error: 'Ordine DPA non riconosciuto' }, 404, origin);
          if (order.status === 'captured' && order.paypal_payload_json)
            return json(JSON.parse(order.paypal_payload_json), 200, origin);
          if (order.status !== 'created')
            return json({ error: 'Prenotazione scaduta; ripeti il checkout' }, 409, origin);
          const active = await env.INVENTORY_DB.prepare(
            `SELECT COUNT(*) AS n FROM reservations WHERE order_id=?
             AND status='active' AND datetime(expires_at) > CURRENT_TIMESTAMP`
          ).bind(String(body.orderID)).first();
          const expected = await env.INVENTORY_DB.prepare(
            'SELECT COUNT(*) AS n FROM order_items WHERE order_id=?'
          ).bind(String(body.orderID)).first();
          if (!active || !expected || Number(active.n) !== Number(expected.n) || !Number(active.n))
            return json({ error: 'Prenotazione scaduta; ripeti il checkout' }, 409, origin);
        }
        const d = await captureOrder(env, body.orderID);
        await completeCentralOrder(env, body.orderID, d);
        return json(d, 200, origin);
      }
      return json({ error: 'not found' }, 404, origin);
    } catch (e) {
      const status = e && e.code === 'stock' ? 409 : 500;
      return json({ error: String(e && e.message || e) }, status, origin);
    }
  }
};
