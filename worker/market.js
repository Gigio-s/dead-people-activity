export function marketTitle(product) {
 let metadata={};try{metadata=JSON.parse(product.metadata_json)||{};}catch(_){}
 const name=String(product.name||'').trim(), artist=String(metadata.artist||'').trim();
 const prefix=artist+' - ';
 return product.category==='musica' && artist && name && !name.toLowerCase().startsWith(prefix.toLowerCase()) ? prefix+name : name;
}

import { MARKET_HTML } from './market-ui.js';

const reply = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{
 'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'}});
const decode = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
let keysCache;
export function marketPhoto(raw, dpa) {
 const path=String(raw||'').replace(/\\+/g,'/');
 if(/^https:\/\//i.test(path)) return path;
 if(!path) return '';
 const origin=dpa?'https://deadpeopleactivity.com/':'https://ramacciatovintage.it/';
 const base=dpa?'assets/img/store/':'photos/inventario/';
 let tail;
 if(path.includes('/media/copertine/')) tail=path.split('/media/copertine/')[1];
 else if(path.includes(base)) return origin+path.slice(path.indexOf(base));
 else return '';
 return origin+base+tail.split('/').map(encodeURIComponent).join('/');
}
export function marketPhotos(raw, dpa) {
 const first=marketPhoto(raw,dpa), other=marketPhoto(raw,!dpa);
 const candidates=[first,other];
 for(const url of [first,other]) {
  for(const base of ['assets/img/store/','photos/inventario/']) {
   if(url.includes(base)) candidates.push(url.slice(0,url.indexOf(base))+base+url.split('/').pop());
  }
 }
 return [...new Set(candidates.filter(Boolean))];
}
export async function accessIdentity(request, env) {
 const team = env.MARKET_ACCESS_TEAM;
 if (!/^[a-z0-9-]+$/.test(team||'') || !env.MARKET_ACCESS_AUD) throw new Error('Access non configurato');
 const jwt = request.headers.get('Cf-Access-Jwt-Assertion') || '';
 const parts = jwt.split('.');
 if(parts.length!==3) throw new Error('Accesso richiesto');
 const header=JSON.parse(new TextDecoder().decode(decode(parts[0])));
 const payload=JSON.parse(new TextDecoder().decode(decode(parts[1])));
 const issuer=`https://${team}.cloudflareaccess.com`;
 const now=Date.now()/1000;
 if(header.alg!=='RS256' || payload.iss!==issuer || !Number.isFinite(payload.exp) || payload.exp<=now ||
    (payload.nbf && payload.nbf>now) || ![].concat(payload.aud||[]).includes(env.MARKET_ACCESS_AUD) || !payload.email)
   throw new Error('Sessione non valida');
 if(!keysCache || keysCache.issuer!==issuer || keysCache.until<Date.now()) {
   const response=await fetch(issuer+'/cdn-cgi/access/certs');
   if(!response.ok) throw new Error('Access non disponibile');
   keysCache={issuer,until:Date.now()+300000,keys:(await response.json()).keys};
 }
 const jwk=keysCache.keys.find(k=>k.kid===header.kid);
 if(!jwk) { keysCache=null; throw new Error('Ripeti accesso'); }
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))
   throw new Error('Sessione non valida');
 if(!String(env.MARKET_ALLOWED_EMAIL||'').split(',').map(x=>x.trim().toLowerCase()).includes(payload.email.toLowerCase()))
   throw new Error('Account non autorizzato');
 return payload.email;
}

export async function marketRoute(request, env, admin) {
 const url=new URL(request.url), path=url.pathname;
 if(!path.startsWith('/market') && !['/admin/market-events','/admin/market-sell'].includes(path)) return null;
 if(env.MARKET_ENABLED!=='1') return reply({error:'Funzione mercatino non attivata'},503);
 if(!env.INVENTORY_DB) return reply({error:'Inventario centrale non configurato'},503);
 try {
   if(path==='/admin/market-sell') {
     if(request.method!=='POST' || !admin(request,env,url)) return reply({error:'Non autorizzato'},401);
     const body=await request.json();
     if(!/^[a-f0-9-]{36}$/i.test(body.operationId||'') || !Number.isSafeInteger(body.priceCents) || body.priceCents<0 || !Number.isSafeInteger(body.expectedStock) || body.expectedStock<1)
       return reply({error:'Vendita PC non valida'},400);
     const id=String(body.productId||'');
     const existing=await env.INVENTORY_DB.prepare('SELECT * FROM market_events WHERE operation_id=?').bind(body.operationId).first();
     if(existing) {
       if(existing.product_id!==id || existing.delta!==-1 || existing.price_cents!==body.priceCents || existing.actor!=='gestionale-pc') return reply({error:'Identificatore gia usato'},409);
       return reply({ok:true,repeated:true});
     }
     await env.INVENTORY_DB.prepare(`INSERT INTO market_events(operation_id,product_id,delta,undo_of,price_cents,actor)
       SELECT ?,id,-1,NULL,?,'gestionale-pc' FROM products WHERE id=? AND stock=?`).bind(body.operationId,body.priceCents,id,body.expectedStock).run();
     const recorded=await env.INVENTORY_DB.prepare('SELECT operation_id FROM market_events WHERE operation_id=?').bind(body.operationId).first();
     if(!recorded) return reply({error:'Quantita online diversa da quella attesa per ID '+id+'. Vendita PC in attesa: verificare le scorte prima di riprovare.'},409);
     return reply({ok:true});
   }
   if(path==='/admin/market-events') {
     if(request.method!=='GET' || !admin(request,env,url)) return reply({error:'Non autorizzato'},401);
     const after=Number(url.searchParams.get('after')||0);
     if(!Number.isSafeInteger(after)||after<0) return reply({error:'Cursore non valido'},400);
     const rows=await env.INVENTORY_DB.prepare('SELECT * FROM market_events WHERE seq>? ORDER BY seq LIMIT 200').bind(after).all();
     return reply({events:rows.results||[]});
   }
   let actor;
   try { actor=await accessIdentity(request,env); } catch(_) { return reply({error:'Accedi con il tuo account autorizzato'},401); }
   if(request.method==='GET' && (path==='/market' || path==='/market/')) return new Response(MARKET_HTML,{headers:{
     'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY',
     'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src https:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"}});
   if(request.method==='GET' && path==='/market/products') {
     const q=(url.searchParams.get('q')||'').trim().slice(0,100);
     const rows=await env.INVENTORY_DB.prepare(`SELECT id,name,category,stock,reserved,price_cents,publish_dpa,metadata_json FROM products
       WHERE (?='' OR instr(lower(name),lower(?))>0 OR id=?
         OR instr(lower(CASE WHEN json_valid(metadata_json) THEN coalesce(json_extract(metadata_json,'$.artist'),'') ELSE '' END),lower(?))>0)
       ORDER BY name LIMIT 100`).bind(q,q,q,q).all();
     return reply({products:(rows.results||[]).map(p=>{
       let m={};try{m=JSON.parse(p.metadata_json);}catch(_){}
       return {id:p.id,name:marketTitle(p),available:Math.max(0,p.stock-p.reserved),reserved:p.reserved,priceCents:p.price_cents,
         photo:marketPhoto((Array.isArray(m.photos)&&m.photos[0])||m.cover,p.publish_dpa),
         photoCandidates:marketPhotos((Array.isArray(m.photos)&&m.photos[0])||m.cover,p.publish_dpa)};
     })});
   }
   if(request.method==='GET' && path==='/market/history') {
     const rows=await env.INVENTORY_DB.prepare(`SELECT e.*,p.name,p.category,p.metadata_json,
       EXISTS(SELECT 1 FROM market_events u WHERE u.undo_of=e.operation_id) AS undone
       FROM market_events e JOIN products p ON p.id=e.product_id WHERE e.delta=-1 ORDER BY e.seq DESC LIMIT 50`).all();
     return reply({sales:(rows.results||[]).map(({metadata_json,category,...row})=>({...row,name:marketTitle({...row,metadata_json,category})}))});
   }
   if(request.method!=='POST' || !['/market/sell','/market/undo'].includes(path)) return reply({error:'Non trovato'},404);
   if(request.headers.get('Origin')!==url.origin || !request.headers.get('Content-Type')?.startsWith('application/json'))
     return reply({error:'Origine richiesta non valida'},403);
   const body=await request.json();
   if(!/^[a-f0-9-]{36}$/i.test(body.operationId||'')) return reply({error:'Identificatore operazione non valido'},400);
   const delta=path.endsWith('/sell')?-1:1;
   let original=null;
   if(delta===1) {
     original=await env.INVENTORY_DB.prepare('SELECT * FROM market_events WHERE operation_id=? AND delta=-1').bind(String(body.undoOf||'')).first();
     if(!original) return reply({error:'Vendita non trovata'},404);
     const undone=await env.INVENTORY_DB.prepare('SELECT operation_id FROM market_events WHERE undo_of=?').bind(original.operation_id).first();
     if(undone) return reply({ok:true,repeated:true});
   }
   const productId=original?original.product_id:String(body.productId||'');
   const existing=await env.INVENTORY_DB.prepare('SELECT * FROM market_events WHERE operation_id=?').bind(body.operationId).first();
   if(existing) {
     if(existing.product_id!==productId || existing.delta!==delta || (existing.undo_of||null)!==(original?.operation_id||null))
       return reply({error:'Identificatore già usato'},409);
     return reply({event:existing,repeated:true});
   }
   const product=await env.INVENTORY_DB.prepare('SELECT * FROM products WHERE id=?').bind(productId).first();
   if(!product) return reply({error:'Articolo non trovato'},404);
   const price=original?original.price_cents:body.priceCents;
   if(!Number.isSafeInteger(price)||price<0) return reply({error:'Prezzo non valido'},400);
   // The INSERT and trigger are one atomic SQLite statement. UNIQUE prevents double sales on retries.
   await env.INVENTORY_DB.prepare(`INSERT INTO market_events(operation_id,product_id,delta,undo_of,price_cents,actor)
     VALUES(?,?,?,?,?,?)`).bind(body.operationId,productId,delta,original?.operation_id||null,price,actor).run();
   return reply({ok:true});
 } catch(error) {
   const message=String(error.message||error);
   return reply({rejected:/Copia non disponibile|Vendita originale non valida/.test(message), error: /Copia non disponibile/.test(message)?'Copia esaurita o prenotata online.':
     /UNIQUE/.test(message)?'Operazione già registrata: aggiorna lo storico.':'Operazione non confermata. Riprova con lo stesso comando o verifica lo storico.'},409);
 }
}
