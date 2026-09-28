import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from './worker.js';

function inventory(product) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (sql.includes('FROM products WHERE id=?')) return product;
              return null;
            }
          };
        }
      };
    }
  };
}

function product(overrides = {}) {
  return {
    id: '7', category: 'musica', name: 'Disco prova', price_cents: 1000,
    stock: 2, reserved: 0, publish_rv: 0, publish_dpa: 1,
    metadata_json: '{}', ...overrides
  };
}

async function quote(env, zona = 'italia') {
  const request = new Request('https://worker.example/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'dpa', zona, items: [{ id: 7, qty: 1 }] })
  });
  const response = await worker.fetch(request, env);
  return { status: response.status, body: await response.json() };
}

function withCatalog(catalog, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    if (String(input).includes('catalogo-musica.json'))
      return new Response(JSON.stringify(catalog), { status: 200 });
    return originalFetch(input);
  };
  return Promise.resolve(callback()).finally(() => { globalThis.fetch = originalFetch; });
}

test('DPA funziona come RV leggendo il catalogo JSON pubblicato', async () => {
  const result = await withCatalog([{
    id: 7, cat: 'musica', name: 'Disco prova', price: 10, copie: 2, sold: false
  }], () => quote({}));
  assert.equal(result.status, 200);
  assert.equal(result.body.total, 15.9);
});

test('cataloghi RV e DPA restano separati anche con lo stesso ID', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes('ramacciatovintage.it/catalogo-musica.json'))
      return new Response(JSON.stringify([{
        id: 7, cat: 'musica', name: 'Prodotto RV', price: 20, copie: 1, sold: false
      }]), { status: 200 });
    if (url.includes('ramacciatovintage.it/catalogo-'))
      return new Response('[]', { status: 200 });
    return originalFetch(input);
  };
  try {
    const request = new Request('https://worker.example/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'rv', zona: 'italia', items: [{ id: 7, qty: 1 }] })
    });
    const response = await worker.fetch(request, {});
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.subtotal, 20);
    assert.equal(body.total, 25.9);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DPA usa il prezzo centrale e le tariffe concordate', async () => {
  const env = { INVENTORY_DB: inventory(product()) };
  const italy = await quote(env);
  assert.equal(italy.status, 200);
  assert.equal(italy.body.total, 15.9);
  const europe = await quote(env, 'europa');
  assert.equal(europe.body.total, 22.9);
});

test('DPA rifiuta articoli non pubblicati, nascosti o esauriti', async () => {
  for (const item of [
    product({ publish_dpa: 0 }),
    product({ metadata_json: '{"nascosto":true}' }),
    product({ stock: 0 })
  ]) {
    const result = await quote({ INVENTORY_DB: inventory(item) });
    assert.equal(result.status, 409);
  }
});

test('PayPal DPA usa le stesse credenziali server-side di RV', async () => {
  const env = { PAYPAL_CLIENT_ID: 'public', PAYPAL_SECRET: 'secret' };
  const request = new Request('https://worker.example/checkout-capabilities?channel=dpa');
  const response = await worker.fetch(request, env);
  assert.equal((await response.json()).ready, true);
});
