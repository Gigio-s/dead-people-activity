import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {marketRoute,marketPhoto} from './market.js';
import {MARKET_HTML} from './market-ui.js';
import sharedWorker from './worker.js';
import dpaWorker from './dpa-worker.js';

function database(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('./market-schema.sql',import.meta.url),'utf8'));
 sql.exec("INSERT INTO products(id,category,name,price_cents,stock,reserved) VALUES('1','musica','Album',1000,2,1)");
 return {sql,async batch(statements){for(const statement of statements) await statement.run()},prepare(query){return {args:[],bind(...args){this.args=args;return this},async first(){return sql.prepare(query).get(...this.args)||null},async all(){return {results:sql.prepare(query).all(...this.args)}},async run(){return sql.prepare(query).run(...this.args)}}}};
}

test('managed image folders are preserved without exposing local paths',()=>{
 assert.equal(marketPhoto('C:/test/media/copertine/Album -- abc/discogs-1.jpg',true),
   'https://deadpeopleactivity.com/assets/img/store/Album%20--%20abc/discogs-1.jpg');
 assert.equal(marketPhoto('C:/private/unknown.jpg',false),'');
});

test('both sync endpoints preserve central quantities and reservations when market enabled',async()=>{
 for(const worker of [sharedWorker,dpaWorker]) {
   const d=database();
   const env={MARKET_ENABLED:'1',INVENTORY_DB:d,ADMIN_API_TOKEN:'fake-test-token'};
   for(const stale of [0,99]) {
     const response=await worker.fetch(new Request('https://example.test/admin/sync-products',{method:'POST',headers:{'Authorization':'Bearer fake-test-token','Content-Type':'application/json'},body:JSON.stringify({products:[{id:'1',category:'musica',name:'Changed',priceCents:1000,stock:stale,publishRv:true,publishDpa:true}]})}),env);
     assert.equal(response.status,200);
     const p=d.sql.prepare('SELECT stock,reserved FROM products').get();
     assert.equal(p.stock,2);assert.equal(p.reserved,1);
   }
   d.sql.close();
 }
});

test('atomic sale, reservation protection, duplicate, undo and replay',()=>{
 const d=database(),insert=d.sql.prepare('INSERT INTO market_events(operation_id,product_id,delta,undo_of,price_cents,actor) VALUES(?,?,?,?,?,?)');
 insert.run('sale','1',-1,null,900,'test@example.test');
 assert.equal(d.sql.prepare('SELECT stock FROM products').get().stock,1);
 assert.throws(()=>insert.run('second','1',-1,null,900,'test@example.test'),/prenotata/);
 assert.throws(()=>insert.run('sale','1',-1,null,900,'test@example.test'));
 insert.run('undo','1',1,'sale',900,'test@example.test');
 assert.equal(d.sql.prepare('SELECT stock FROM products').get().stock,2);
 assert.throws(()=>insert.run('undo2','1',1,'sale',900,'test@example.test'),/UNIQUE/);
 assert.equal(d.sql.prepare('SELECT count(*) n FROM market_events').get().n,2);
 d.sql.close();
});

test('disabled, unauthenticated and no browser admin token',async()=>{
 const d=database();
 assert.equal((await marketRoute(new Request('https://example.test/market'),{},()=>true)).status,503);
 assert.equal((await marketRoute(new Request('https://example.test/market'),{MARKET_ENABLED:'1',INVENTORY_DB:d},()=>true)).status,401);
 assert.equal((await marketRoute(new Request('https://example.test/admin/market-events'),{MARKET_ENABLED:'1',INVENTORY_DB:d},()=>false)).status,401);
 assert.doesNotMatch(MARKET_HTML,/ADMIN_API_TOKEN/);
 new Function(MARKET_HTML.match(/<script>([\s\S]*?)<\/script>/)[1]);
 d.sql.close();
});

test('signed Access session, origin guard, sale retry, undo and private feed',async()=>{
 const d=database();
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='test';
 const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
 const unsigned=b64({alg:'RS256',kid:'test'})+'.'+b64({iss:'https://test-team.cloudflareaccess.com',aud:['test-aud'],exp:Date.now()/1000+1000,email:'test@example.test'});
 const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(unsigned));
 const jwt=unsigned+'.'+Buffer.from(sig).toString('base64url');
 const env={MARKET_ENABLED:'1',INVENTORY_DB:d,MARKET_ACCESS_TEAM:'test-team',MARKET_ACCESS_AUD:'test-aud',MARKET_ALLOWED_EMAIL:'test@example.test'};
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}));
 try {
 const call=(path,body,origin='https://example.test')=>marketRoute(new Request('https://example.test'+path,{method:body?'POST':'GET',headers:{'Cf-Access-Jwt-Assertion':jwt,'Origin':origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,()=>true);
 d.sql.prepare('UPDATE products SET name=?,metadata_json=? WHERE id=?').run('Dangerous',JSON.stringify({artist:'Michael Jackson'}),'1');
 for(const query of ['Michael Jackson','JACKSON','michael','Dangerous','1']) {
  const result=await (await call('/market/products?q='+encodeURIComponent(query))).json();
  assert.deepEqual(result.products.map(p=>p.id),['1'],query);
 }
 assert.equal((await (await call('/market/products?q=Unknown')).json()).products.length,0);
 d.sql.prepare('UPDATE products SET metadata_json=? WHERE id=?').run('invalid-json','1');
 assert.equal((await (await call('/market/products?q=Jackson')).json()).products.length,0);
 assert.equal((await (await call('/market/products?q=Dangerous')).json()).products.length,1);
 const body={operationId:crypto.randomUUID(),productId:'1',priceCents:900};
 assert.equal((await call('/market/sell',body,'https://evil.test')).status,403);
 assert.equal((await call('/market/sell',body)).status,200);
 assert.equal((await call('/market/sell',body)).status,200);
 assert.equal(d.sql.prepare('SELECT stock FROM products').get().stock,1);
 assert.equal((await call('/market/undo',{operationId:crypto.randomUUID(),undoOf:body.operationId})).status,200);
 const feed=await (await call('/admin/market-events?after=0')).json();assert.equal(feed.events.length,2);
 assert.equal((await (await call('/admin/market-events?after=2')).json()).events.length,0);
 } finally {globalThis.fetch=oldFetch;d.sql.close()}
});

test('PC sales require admin, expected stock, preserve reservations and retry once',async()=>{
 const d=database();
 const env={MARKET_ENABLED:'1',INVENTORY_DB:d};
 const call=(body,allowed=true)=>marketRoute(new Request('https://example.test/admin/market-sell',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),env,()=>allowed);
 try {
  const body={operationId:crypto.randomUUID(),productId:'1',priceCents:900,expectedStock:2};
  assert.equal((await call(body,false)).status,401);
  assert.equal((await call({...body,expectedStock:3})).status,409);
  assert.equal(d.sql.prepare('SELECT stock FROM products').get().stock,2);
  assert.equal((await call(body)).status,200);
  assert.equal((await call(body)).status,200);
  assert.equal(d.sql.prepare('SELECT stock FROM products').get().stock,1);
  assert.equal(d.sql.prepare('SELECT count(*) n FROM market_events').get().n,1);
  assert.equal((await call({...body,priceCents:999})).status,409);
  assert.equal((await call({...body,operationId:crypto.randomUUID(),expectedStock:1})).status,409);
  assert.equal(d.sql.prepare('SELECT stock FROM products').get().stock,1);
 } finally {d.sql.close()}
});
