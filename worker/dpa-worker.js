// Dead People Activity - catalogo JSON + PayPal Checkout server-side.
const CATALOG_URL = 'https://deadpeopleactivity.com/assets/data/store/catalogo-musica.json';
const SHIPPING = { italia: 5.90, europa: 12.90 };
const FREE_ABOVE = 50.00;
const EUROPE_COUNTRIES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
  'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','GB','CH','NO','IS'
]);
const ALLOWED_ORIGINS = new Set([
  'https://deadpeopleactivity.com',
  'https://www.deadpeopleactivity.com'
]);

let catalogCache = null;
let catalogTimestamp = 0;

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function cents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function money(value) {
  return round2((Number(value) || 0) / 100);
}

function productMetadata(row) {
  try { return JSON.parse(row.metadata_json || '{}'); }
  catch (_) { return {}; }
}

function hiddenInMetadata(row) {
  const metadata = productMetadata(row);
  return metadata.nascosto === true || metadata.nascosto === 1 || metadata.nascosto === '1';
}

function publicPhotoPath(path) {
  const value = String(path || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const filename = value.split(/[\\/]/).pop();
  return filename ? 'assets/img/store/' + filename : '';
}

function isAdmin(request, env, url) {
  if (!env.ADMIN_API_TOKEN) return false;
  const authorization = request.headers.get('Authorization') || '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  return bearer === env.ADMIN_API_TOKEN || url.searchParams.get('token') === env.ADMIN_API_TOKEN;
}

async function syncProducts(env, products) {
  if (!env.INVENTORY_DB) throw new Error('Inventario D1 non configurato');
  const rows = Array.isArray(products) ? products : [];
  await env.INVENTORY_DB.prepare('UPDATE products SET publish_rv=0,publish_dpa=0').run();
  const statements = [];
  for (const product of rows) {
    if (!product || product.id == null) continue;
    statements.push(env.INVENTORY_DB.prepare(
      `INSERT INTO products
       (id,category,name,price_cents,stock,reserved,publish_rv,publish_dpa,metadata_json,updated_at)
       VALUES(?,?,?,?,?,0,?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         category=excluded.category,name=excluded.name,price_cents=excluded.price_cents,
         stock=MIN(products.stock,excluded.stock),reserved=MIN(products.reserved,excluded.stock),
         publish_rv=excluded.publish_rv,publish_dpa=excluded.publish_dpa,
         metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`
    ).bind(
      String(product.id), String(product.category || ''), String(product.name || 'Articolo'),
      Math.max(0, Number(product.priceCents) || 0), Math.max(0, Number(product.stock) || 0),
      product.publishRv ? 1 : 0, product.publishDpa ? 1 : 0,
      JSON.stringify(product.metadata || {})
    ));
  }
  for (let index = 0; index < statements.length; index += 75)
    await env.INVENTORY_DB.batch(statements.slice(index, index + 75));
  return statements.length;
}

async function listOrders(env) {
  if (!env.INVENTORY_DB) throw new Error('Inventario D1 non configurato');
  const orders = await env.INVENTORY_DB.prepare(
    'SELECT * FROM orders ORDER BY created_at DESC LIMIT 500'
  ).all();
  const result = [];
  for (const order of orders.results || []) {
    const items = await env.INVENTORY_DB.prepare(
      `SELECT product_id AS id,name,category AS cat,unit_price_cents,quantity AS qty
       FROM order_items WHERE order_id=?`
    ).bind(order.order_id).all();
    result.push({
      orderId: order.order_id, data: order.created_at, nome: order.customer_name,
      email: order.customer_email, indirizzo: order.shipping_address, zona: order.shipping_zone,
      tot: money(order.total_cents), sconto: money(order.discount_cents), codice: order.discount_code,
      canale: order.source, stato: order.status,
      articoli: (items.results || []).map(item => ({ ...item, price: money(item.unit_price_cents) }))
    });
  }
  return result;
}

function corsHeaders(origin) {
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
  const allowed = ALLOWED_ORIGINS.has(origin) || local
    ? origin
    : 'https://deadpeopleactivity.com';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders(origin))
  });
}

function visible(product) {
  return product && product.id != null && !product.sold &&
    product.nascosto !== true && product.nascosto !== 1 && product.nascosto !== '1';
}

async function loadCatalog() {
  const now = Date.now();
  if (catalogCache && now - catalogTimestamp < 60000) return catalogCache;
  const response = await fetch(CATALOG_URL, { cf: { cacheTtl: 60 } });
  if (!response.ok) throw new Error('Catalogo DPA non disponibile');
  const products = await response.json();
  if (!Array.isArray(products)) throw new Error('Catalogo DPA non valido');
  catalogCache = products.filter(visible);
  catalogTimestamp = now;
  return catalogCache;
}

async function publicProducts(env) {
  if (!env.INVENTORY_DB) return await loadCatalog();
  const result = await env.INVENTORY_DB.prepare(
    `SELECT id,name,category,price_cents,stock,reserved,metadata_json
     FROM products
     WHERE publish_dpa=1 AND category='musica'
     ORDER BY updated_at DESC`
  ).all();
  return (result.results || []).filter(row => !hiddenInMetadata(row)).map(row => {
    const product = productMetadata(row);
    product.id = row.id;
    product.name = product.name || row.name;
    product.cat = product.cat || row.category;
    product.price = money(row.price_cents);
    product.photos = (Array.isArray(product.photos) ? product.photos : [product.photos])
      .map(publicPhotoPath).filter(Boolean);
    product.copie = Math.max(0, Number(row.stock) - Number(row.reserved));
    product.sold = product.copie <= 0;
    return product;
  });
}

async function databaseProduct(env, id) {
  if (!env.INVENTORY_DB) return null;
  return await env.INVENTORY_DB.prepare(
    `SELECT id,name,category,price_cents,stock,reserved,publish_dpa,metadata_json
     FROM products WHERE id=?`
  ).bind(String(id)).first();
}

async function computeTotals(body, env) {
  const requested = Array.isArray(body.items) ? body.items : [];
  const zone = body.zona === 'europa' ? 'europa' : 'italia';
  const catalog = env.INVENTORY_DB ? null : await loadCatalog();
  const byId = catalog ? new Map(catalog.map(product => [String(product.id), product])) : null;
  const lines = [];
  let subtotal = 0;

  for (const item of requested) {
    const row = env.INVENTORY_DB ? await databaseProduct(env, item.id) : null;
    if (row && (Number(row.publish_dpa) !== 1 || row.category !== 'musica' || hiddenInMetadata(row))) {
      const error = new Error('Articolo DPA non disponibile');
      error.name = 'StockError';
      throw error;
    }
    const product = row ? {
      id: row.id,
      name: row.name,
      price: money(row.price_cents),
      copie: Math.max(0, Number(row.stock) - Number(row.reserved))
    } : (byId ? byId.get(String(item.id)) : null);
    const quantity = Number(item.qty);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      const error = new Error('Articolo non disponibile');
      error.name = 'StockError';
      throw error;
    }
    const available = Math.max(0, Math.floor(Number(product.copie == null ? 1 : product.copie) || 0));
    if (quantity > available) {
      const error = new Error('Quantità non disponibile per ' + (product.name || product.id));
      error.name = 'StockError';
      throw error;
    }
    const price = round2(Number(product.price) || 0);
    if (price <= 0) throw new Error('Prezzo non valido');
    const lineTotal = round2(price * quantity);
    subtotal = round2(subtotal + lineTotal);
    lines.push({
      id: product.id,
      name: product.name || 'Articolo',
      price,
      qty: quantity,
      lineTotal
    });
  }

  let shipping = subtotal >= FREE_ABOVE ? 0 : SHIPPING[zone];
  shipping = round2(shipping);
  return { lines, subtotal, shipping, total: round2(subtotal + shipping), zona: zone };
}

async function releaseExpired(env) {
  if (!env.INVENTORY_DB) return;
  const expired = await env.INVENTORY_DB.prepare(
    `SELECT order_id,product_id,quantity FROM reservations
     WHERE status='active' AND datetime(expires_at)<=CURRENT_TIMESTAMP`
  ).all();
  for (const reservation of expired.results || []) {
    await env.INVENTORY_DB.batch([
      env.INVENTORY_DB.prepare(
        'UPDATE products SET reserved=MAX(0,reserved-?) WHERE id=?'
      ).bind(reservation.quantity, reservation.product_id),
      env.INVENTORY_DB.prepare(
        `UPDATE reservations SET status='expired'
         WHERE order_id=? AND product_id=? AND status='active'`
      ).bind(reservation.order_id, reservation.product_id),
      env.INVENTORY_DB.prepare(
        `UPDATE orders SET status='expired',updated_at=CURRENT_TIMESTAMP
         WHERE order_id=? AND status='created'`
      ).bind(reservation.order_id)
    ]);
  }
}

async function reserveOrder(env, orderId, totals) {
  if (!env.INVENTORY_DB) return;
  await releaseExpired(env);
  const reserved = [];
  try {
    for (const line of totals.lines) {
      const result = await env.INVENTORY_DB.prepare(
        `UPDATE products SET reserved=reserved+?,updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND publish_dpa=1 AND stock-reserved>=?`
      ).bind(line.qty, String(line.id), line.qty).run();
      if (!result.meta || Number(result.meta.changes) !== 1) {
        const error = new Error('Articolo appena esaurito: ' + line.name);
        error.name = 'StockError';
        throw error;
      }
      reserved.push(line);
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const statements = [env.INVENTORY_DB.prepare(
      `INSERT INTO orders
       (order_id,source,status,shipping_zone,subtotal_cents,discount_cents,shipping_cents,total_cents)
       VALUES(?,'dpa','created',?,?,0,?,?)`
    ).bind(orderId, totals.zona, cents(totals.subtotal), cents(totals.shipping), cents(totals.total))];
    for (const line of totals.lines) {
      statements.push(env.INVENTORY_DB.prepare(
        `INSERT INTO order_items(order_id,product_id,name,category,unit_price_cents,quantity)
         VALUES(?,?,?,'musica',?,?)`
      ).bind(orderId, String(line.id), line.name, cents(line.price), line.qty));
      statements.push(env.INVENTORY_DB.prepare(
        `INSERT INTO reservations(order_id,product_id,quantity,status,expires_at)
         VALUES(?,?,?,'active',?)`
      ).bind(orderId, String(line.id), line.qty, expiresAt));
    }
    await env.INVENTORY_DB.batch(statements);
  } catch (error) {
    for (const line of reserved) {
      await env.INVENTORY_DB.prepare(
        'UPDATE products SET reserved=MAX(0,reserved-?) WHERE id=?'
      ).bind(line.qty, String(line.id)).run();
    }
    throw error;
  }
}

function paypalCustomer(payload) {
  const payer = payload.payer || {};
  const unit = (payload.purchase_units || [])[0] || {};
  const shipping = unit.shipping || {};
  const address = shipping.address || {};
  const capture = (((unit.payments || {}).captures || [])[0]) || {};
  const name = [payer.name && payer.name.given_name, payer.name && payer.name.surname]
    .filter(Boolean).join(' ') || (shipping.name && shipping.name.full_name) || '';
  return {
    name,
    email: payer.email_address || '',
    address: [address.address_line_1, address.address_line_2, address.admin_area_2,
      address.admin_area_1, address.postal_code, address.country_code].filter(Boolean).join(', '),
    captureId: capture.id || ''
  };
}

async function completeOrder(env, orderId, payload) {
  if (!env.INVENTORY_DB || payload.status !== 'COMPLETED') return;
  const order = await env.INVENTORY_DB.prepare(
    'SELECT status FROM orders WHERE order_id=? AND source=\'dpa\''
  ).bind(orderId).first();
  if (!order || order.status === 'captured') return;
  const reservations = await env.INVENTORY_DB.prepare(
    `SELECT product_id,quantity FROM reservations
     WHERE order_id=? AND status='active'`
  ).bind(orderId).all();
  const customer = paypalCustomer(payload);
  const statements = [];
  for (const item of reservations.results || []) {
    statements.push(env.INVENTORY_DB.prepare(
      `UPDATE products SET stock=MAX(0,stock-?),reserved=MAX(0,reserved-?),updated_at=CURRENT_TIMESTAMP
       WHERE id=?`
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

async function validateReservation(env, orderId) {
  if (!env.INVENTORY_DB) return null;
  await releaseExpired(env);
  const order = await env.INVENTORY_DB.prepare(
    `SELECT status,paypal_payload_json FROM orders WHERE order_id=? AND source='dpa'`
  ).bind(orderId).first();
  if (!order) throw new Error('Ordine DPA non riconosciuto');
  if (order.status === 'captured' && order.paypal_payload_json)
    return JSON.parse(order.paypal_payload_json);
  if (order.status !== 'created') {
    const error = new Error('Prenotazione scaduta; ripeti il checkout');
    error.name = 'StockError';
    throw error;
  }
  const active = await env.INVENTORY_DB.prepare(
    `SELECT COUNT(*) AS n FROM reservations
     WHERE order_id=? AND status='active' AND datetime(expires_at)>CURRENT_TIMESTAMP`
  ).bind(orderId).first();
  const expected = await env.INVENTORY_DB.prepare(
    'SELECT COUNT(*) AS n FROM order_items WHERE order_id=?'
  ).bind(orderId).first();
  if (!active || !expected || Number(active.n) !== Number(expected.n) || !Number(active.n)) {
    const error = new Error('Prenotazione scaduta; ripeti il checkout');
    error.name = 'StockError';
    throw error;
  }
  return null;
}

function validatedShipping(value, zone) {
  const input = value && typeof value === 'object' ? value : {};
  const fullName = String(input.name || '').trim();
  const address = String(input.address || '').trim();
  const city = String(input.city || '').trim();
  const postal = String(input.postal || '').trim();
  const region = String(input.region || '').trim();
  const country = String(input.country || '').trim().toUpperCase();
  if (!fullName || !address || !city || !postal || !EUROPE_COUNTRIES.has(country))
    throw new Error('Indirizzo di spedizione incompleto o Paese non supportato');
  if (zone !== (country === 'IT' ? 'italia' : 'europa'))
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

function paypalBase(env) {
  return env.PAYPAL_ENV === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

async function paypalToken(env) {
  const auth = btoa(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_SECRET);
  const response = await fetch(paypalBase(env) + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('Errore autenticazione PayPal');
  return data.access_token;
}

async function createOrder(env, totals, shipping) {
  const token = await paypalToken(env);
  const items = totals.lines.map(line => ({
    name: String(line.name).slice(0, 127),
    quantity: String(line.qty),
    unit_amount: { currency_code: 'EUR', value: line.price.toFixed(2) },
    category: 'PHYSICAL_GOODS'
  }));
  const response = await fetch(paypalBase(env) + '/v2/checkout/orders', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        description: 'Dead People Activity - Ordine',
        amount: {
          currency_code: 'EUR',
          value: totals.total.toFixed(2),
          breakdown: {
            item_total: { currency_code: 'EUR', value: totals.subtotal.toFixed(2) },
            shipping: { currency_code: 'EUR', value: totals.shipping.toFixed(2) }
          }
        },
        items,
        shipping
      }],
      application_context: {
        brand_name: 'Dead People Activity',
        locale: 'it-IT',
        user_action: 'PAY_NOW',
        shipping_preference: 'SET_PROVIDED_ADDRESS'
      }
    })
  });
  const data = await response.json();
  if (!response.ok || !data.id) throw new Error('Errore creazione ordine PayPal');
  return data.id;
}

async function captureOrder(env, orderId) {
  const token = await paypalToken(env);
  const endpoint = paypalBase(env) + '/v2/checkout/orders/' + encodeURIComponent(orderId);
  const currentResponse = await fetch(endpoint, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (currentResponse.ok) {
    const current = await currentResponse.json();
    if (current.status === 'COMPLETED') return current;
  }
  const response = await fetch(endpoint + '/capture', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Errore conferma pagamento PayPal');
  return data;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders(origin) });

    try {
      if (request.method === 'GET' && url.pathname === '/')
        return json({ service: 'dpa-checkout', ready: true }, 200, origin);
      if (request.method === 'GET' && url.pathname === '/checkout-capabilities')
        return json({ ready: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET && env.INVENTORY_DB), channel: 'dpa' }, 200, origin);
      if (request.method === 'GET' && url.pathname === '/products')
        return json({ products: await publicProducts(env), channel: 'dpa' }, 200, origin);
      if (request.method === 'GET' && url.pathname === '/orders') {
        if (!isAdmin(request, env, url)) return json({ error: 'non autorizzato' }, 401, origin);
        return json({ orders: await listOrders(env) }, 200, origin);
      }
      if (request.method !== 'POST') return json({ error: 'method' }, 405, origin);

      let body;
      try { body = await request.json(); }
      catch (_) { return json({ error: 'bad json' }, 400, origin); }

      if (url.pathname === '/admin/sync-products') {
        if (!isAdmin(request, env, url)) return json({ error: 'non autorizzato' }, 401, origin);
        return json({ synced: await syncProducts(env, body.products) }, 200, origin);
      }
      if (url.pathname === '/quote') {
        const totals = await computeTotals(body, env);
        return json({
          subtotal: totals.subtotal,
          shipping: totals.shipping,
          total: totals.total
        }, 200, origin);
      }
      if (url.pathname === '/create-order') {
        if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET)
          return json({ error: 'PayPal non configurato' }, 503, origin);
        const totals = await computeTotals(body, env);
        if (!totals.lines.length) return json({ error: 'carrello vuoto' }, 400, origin);
        const shipping = validatedShipping(body.shipping, totals.zona);
        const id = await createOrder(env, totals, shipping);
        await reserveOrder(env, id, totals);
        return json({ id, total: totals.total }, 200, origin);
      }
      if (url.pathname === '/capture-order') {
        if (!body.orderID) return json({ error: 'orderID mancante' }, 400, origin);
        const orderId = String(body.orderID);
        const completed = await validateReservation(env, orderId);
        if (completed) return json(completed, 200, origin);
        const payload = await captureOrder(env, orderId);
        await completeOrder(env, orderId, payload);
        return json(payload, 200, origin);
      }
      return json({ error: 'not found' }, 404, origin);
    } catch (error) {
      return json({ error: String(error && error.message || error) }, error && error.name === 'StockError' ? 409 : 500, origin);
    }
  }
};
