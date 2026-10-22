// Dedicated private hostname: protect this Worker with Cloudflare Access.
import {marketRoute} from './market.js';
export default {
 async fetch(request,env) {
   const url=new URL(request.url);
   if(url.pathname==='/')return Response.redirect(url.origin+'/market',302);
   return await marketRoute(request,env,()=>false) || new Response('Non trovato',{status:404});
 }
};
